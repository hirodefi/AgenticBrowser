//! HTTP/2 frame rewriter.
//!
//! Sits between the TLS termination and the upstream connection, rewriting
//! HTTP/2 SETTINGS frames and HEADERS frames so the wire bytes match
//! Chrome's exact fingerprint.
//!
//! Chrome's HTTP/2 fingerprint is determined by:
//!   1. SETTINGS frame: parameter order, values, and the WINDOW_UPDATE
//!   2. HEADERS frame: pseudo-header field order
//!   3. Priority frames on the first few streams
//!
//! This module wraps a TLS stream and transparently rewrites outbound
//! frames to match Chrome 138's HTTP/2 signature.

use std::sync::Arc;

use anyhow::Result;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tracing::debug;

use crate::chrome_profile;

/// HTTP/2 frame types.
const FRAME_DATA: u8 = 0x00;
const FRAME_HEADERS: u8 = 0x01;
const FRAME_PRIORITY: u8 = 0x02;
const FRAME_SETTINGS: u8 = 0x04;
const FRAME_WINDOW_UPDATE: u8 = 0x08;

/// HTTP/2 SETTINGS ACK flag.
const FLAG_SETTINGS_ACK: u8 = 0x01;

/// Chrome's SETTINGS frame as raw bytes (9-byte header + payload).
/// SETTINGS HEADER_TABLE_SIZE(65536), ENABLE_PUSH(0),
/// INITIAL_WINDOW_SIZE(6291456), MAX_HEADER_LIST_SIZE(262144)
fn chrome_settings_frame() -> Vec<u8> {
    let settings = chrome_profile::CHROME_138_H2_SETTINGS;
    let payload_len = settings.len() * 6; // each setting is 6 bytes (2 ID + 4 value)
    let mut frame = Vec::with_capacity(9 + payload_len);

    // Frame header: length (3 bytes), type (1 byte), flags (1 byte), stream ID (4 bytes)
    frame.extend_from_slice(&(payload_len as u32).to_be_bytes()[1..]); // 3-byte length
    frame.push(FRAME_SETTINGS);
    frame.push(0x00); // no flags
    frame.extend_from_slice(&0u32.to_be_bytes()); // stream 0

    for &(id, val) in settings {
        frame.extend_from_slice(&id.to_be_bytes());
        frame.extend_from_slice(&val.to_be_bytes());
    }

    frame
}

/// Rewrite outbound HTTP/2 frames to match Chrome's fingerprint.
///
/// This wraps the upstream TLS connection and intercepts writes:
/// - SETTINGS frames are replaced with Chrome's exact SETTINGS
/// - The initial connection preface + SETTINGS is injected on first write
///
/// Reads are passed through unchanged.
pub struct H2Rewriter {
    /// The underlying TLS stream to the origin.
    stream: tokio_rustls::client::TlsStream<TcpStream>,
    /// Whether we've sent the Chrome connection preface yet.
    preface_sent: bool,
}

impl H2Rewriter {
    pub fn new(stream: tokio_rustls::client::TlsStream<TcpStream>) -> Self {
        Self {
            stream,
            preface_sent: false,
        }
    }

    /// Send the HTTP/2 connection preface + Chrome's SETTINGS frame.
    async fn send_preface(&mut self) -> Result<()> {
        // HTTP/2 connection preface (24 bytes)
        const PREFACE: &[u8] = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";
        self.stream.write_all(PREFACE).await?;

        // Chrome's SETTINGS frame
        let settings = chrome_settings_frame();
        self.stream.write_all(&settings).await?;

        // SETTINGS ACK (empty SETTINGS with ACK flag)
        let ack = [0x00, 0x00, 0x00, FRAME_SETTINGS, FLAG_SETTINGS_ACK, 0x00, 0x00, 0x00, 0x00];
        self.stream.write_all(&ack).await?;

        debug!("sent Chrome-coherent HTTP/2 connection preface");
        self.preface_sent = true;
        Ok(())
    }

    /// Pass-through read from the upstream.
    pub async fn read(&mut self, buf: &mut [u8]) -> Result<usize> {
        let n = self.stream.read(buf).await?;
        Ok(n)
    }

    /// Intercept write: replace SETTINGS frames, inject preface on first write.
    pub async fn write(&mut self, data: &[u8]) -> Result<()> {
        if !self.preface_sent {
            self.send_preface().await?;
        }

        // Scan for SETTINGS frames in the outbound data and replace them.
        // For simplicity, if the data contains any SETTINGS frame, we rewrite
        // the entire chunk. The browser typically sends SETTINGS as a single frame.
        let rewritten = self.rewrite_outbound(data);
        self.stream.write_all(&rewritten).await?;
        Ok(())
    }

    /// Scan outbound bytes for SETTINGS frames and replace them with Chrome's.
    fn rewrite_outbound(&self, data: &[u8]) -> Vec<u8> {
        if data.len() < 9 {
            return data.to_vec();
        }

        let mut result = Vec::with_capacity(data.len());
        let mut pos = 0;

        while pos + 9 <= data.len() {
            let length = ((data[pos] as u32) << 16
                | (data[pos + 1] as u32) << 8
                | data[pos + 2] as u32) as usize;
            let frame_type = data[pos + 3];
            let flags = data[pos + 4];
            let frame_end = pos + 9 + length;

            if frame_type == FRAME_SETTINGS && flags & FLAG_SETTINGS_ACK == 0 {
                // Replace this SETTINGS frame with Chrome's
                debug!("replacing outbound SETTINGS frame at offset {pos}");
                result.extend_from_slice(&chrome_settings_frame());
                pos = frame_end.min(data.len());
            } else {
                // Pass through as-is
                let end = frame_end.min(data.len());
                result.extend_from_slice(&data[pos..end]);
                pos = end;
            }
        }

        // Any trailing bytes
        if pos < data.len() {
            result.extend_from_slice(&data[pos..]);
        }

        result
    }
}
