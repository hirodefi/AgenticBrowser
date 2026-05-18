//! agentic-tls-shim
//!
//! A localhost HTTP CONNECT proxy that terminates the browser's TLS
//! connection and re-establishes the outbound TLS connection with a
//! Chrome-coherent ClientHello. The browser sees a normal proxy;
//! upstream servers see a TLS handshake whose JA3 / JA4 / Akamai
//! fingerprints match Chrome stable for the configured version.
//!
//! Run:
//!   agentic-tls-shim --listen 127.0.0.1:8443
//!
//! Then point the browser at it as an HTTP proxy. The JS runtime
//! configures this automatically when `tlsShim: 'auto'` is set in
//! BrowserConfig.
//!
//! Status: scaffold. Listener and CONNECT handling work end-to-end with
//! default rustls settings (which already approximate Chrome better than
//! Node/Go defaults). The ChromeProfile module below is the seam where
//! cipher order, extensions, ALPN, GREASE, and HTTP/2 SETTINGS get
//! pinned to Chrome's exact wire bytes.

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{error, info, warn};

mod chrome_profile;

#[derive(Parser, Debug)]
#[command(version, about)]
struct Args {
    /// Listen address for incoming proxy connections.
    #[arg(long, default_value = "127.0.0.1:8443")]
    listen: SocketAddr,

    /// Chrome version to mimic (controls ClientHello / SETTINGS shape).
    #[arg(long, default_value = "138")]
    chrome_version: u32,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info".into()))
        .init();

    let args = Args::parse();
    let profile = Arc::new(chrome_profile::ChromeProfile::for_version(args.chrome_version)?);
    info!(target: "shim", "listening on {} (Chrome profile {})", args.listen, args.chrome_version);

    let listener = TcpListener::bind(args.listen).await
        .with_context(|| format!("bind {}", args.listen))?;
    loop {
        let (client, peer) = match listener.accept().await {
            Ok(x) => x,
            Err(e) => { error!("accept failed: {e}"); continue; }
        };
        let prof = profile.clone();
        tokio::spawn(async move {
            if let Err(e) = handle(client, prof).await {
                warn!(?peer, "connection ended: {e}");
            }
        });
    }
}

async fn handle(mut client: TcpStream, profile: Arc<chrome_profile::ChromeProfile>) -> Result<()> {
    // Read the HTTP request line + headers (we only act on CONNECT).
    let mut buf = vec![0u8; 8192];
    let mut filled = 0usize;
    loop {
        if filled == buf.len() { return Err(anyhow!("header overflow")); }
        let n = client.read(&mut buf[filled..]).await?;
        if n == 0 { return Err(anyhow!("client closed before request")); }
        filled += n;
        if buf[..filled].windows(4).any(|w| w == b"\r\n\r\n") { break; }
    }

    let head = std::str::from_utf8(&buf[..filled])?;
    let mut lines = head.split("\r\n");
    let request_line = lines.next().ok_or_else(|| anyhow!("empty request"))?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");

    if method != "CONNECT" {
        let _ = client.write_all(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n").await;
        return Err(anyhow!("only CONNECT supported; got {method}"));
    }

    let (host, port) = parse_host_port(target).context("parse CONNECT target")?;
    let upstream = TcpStream::connect((host.as_str(), port)).await
        .with_context(|| format!("connect {host}:{port}"))?;

    client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n").await?;

    // For an :443 tunnel, splice raw bytes. The browser will perform its
    // own TLS handshake through us — without re-handshaking on the outbound
    // side we don't yet alter the JA3 fingerprint. That is the
    // chrome_profile module's job in the next milestone: terminate the
    // browser's TLS using a local trust anchor, then re-handshake outbound
    // with profile.client_config().
    let _ = profile.client_config(); // engaged once the MITM path lands
    splice(client, upstream).await
}

async fn splice(mut a: TcpStream, mut b: TcpStream) -> Result<()> {
    let (mut ar, mut aw) = a.split();
    let (mut br, mut bw) = b.split();
    let c2u = tokio::io::copy(&mut ar, &mut bw);
    let u2c = tokio::io::copy(&mut br, &mut aw);
    tokio::try_join!(c2u, u2c)?;
    Ok(())
}

fn parse_host_port(target: &str) -> Result<(String, u16)> {
    let (h, p) = target.rsplit_once(':').ok_or_else(|| anyhow!("missing port: {target}"))?;
    let h = h.trim_start_matches('[').trim_end_matches(']');
    Ok((h.to_string(), p.parse()?))
}
