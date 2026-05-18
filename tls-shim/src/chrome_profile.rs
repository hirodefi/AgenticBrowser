//! Chrome-coherent TLS / HTTP-2 profile.
//!
//! Each `ChromeProfile` describes the wire bytes a real Chrome of a
//! given stable version would emit:
//!
//!   * ClientHello cipher suites (order matters for JA3/JA4)
//!   * Extensions and their order (ja4 hash key)
//!   * ALPN values ("h2", "http/1.1") in Chrome's order
//!   * GREASE values placed in the spots Chrome places them
//!   * Supported groups (X25519MLKEM768, X25519, secp256r1, secp384r1)
//!   * Signature algorithms in Chrome order
//!   * HTTP/2 SETTINGS frame field order + values
//!   * HTTP/2 HEADERS frame pseudo-header order
//!
//! For the v0.1 milestone we expose `client_config()` that uses rustls
//! defaults (which are not Chrome but closer than Node/Go defaults).
//! The intercept path uses this profile to MITM the browser's TLS and
//! re-handshake upstream with a custom `ClientHelloPayload` — that
//! pipeline lives in the next milestone.

use std::sync::Arc;

use anyhow::Result;
use rustls::ClientConfig;

/// One Chrome version's full wire profile.
pub struct ChromeProfile {
    pub version: u32,
    /// rustls client config used for outbound TLS to the origin server.
    client_config: Arc<ClientConfig>,
}

impl ChromeProfile {
    pub fn for_version(version: u32) -> Result<Self> {
        let mut roots = rustls::RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

        let mut config = ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();

        // Pinned for now; future milestone replaces ClientHelloPayload
        // construction with a Chrome-coherent one (cipher order, extension
        // order, GREASE positions, ALPN: h2, http/1.1).
        config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
        config.enable_sni = true;

        Ok(Self {
            version,
            client_config: Arc::new(config),
        })
    }

    pub fn client_config(&self) -> Arc<ClientConfig> {
        self.client_config.clone()
    }
}

/// Cipher suites in Chrome stable order. Used by the next-milestone
/// custom ClientHello builder.
pub const CHROME_138_CIPHERS: &[u16] = &[
    0x1301, // TLS_AES_128_GCM_SHA256
    0x1302, // TLS_AES_256_GCM_SHA384
    0x1303, // TLS_CHACHA20_POLY1305_SHA256
    0xc02b, // ECDHE-ECDSA-AES128-GCM-SHA256
    0xc02f, // ECDHE-RSA-AES128-GCM-SHA256
    0xc02c, // ECDHE-ECDSA-AES256-GCM-SHA384
    0xc030, // ECDHE-RSA-AES256-GCM-SHA384
    0xcca9, // ECDHE-ECDSA-CHACHA20-POLY1305
    0xcca8, // ECDHE-RSA-CHACHA20-POLY1305
    0xc013, // ECDHE-RSA-AES128-SHA
    0xc014, // ECDHE-RSA-AES256-SHA
    0x009c, // RSA-AES128-GCM-SHA256
    0x009d, // RSA-AES256-GCM-SHA384
    0x002f, // RSA-AES128-SHA
    0x0035, // RSA-AES256-SHA
];

/// HTTP/2 SETTINGS values Chrome stable sends, in Chrome's order.
pub const CHROME_138_H2_SETTINGS: &[(u16, u32)] = &[
    (0x01, 65536),     // HEADER_TABLE_SIZE
    (0x02, 0),         // ENABLE_PUSH
    (0x04, 6291456),   // INITIAL_WINDOW_SIZE
    (0x06, 262144),    // MAX_HEADER_LIST_SIZE
];

/// HTTP/2 pseudo-header order Chrome uses.
pub const CHROME_PSEUDO_HEADER_ORDER: &[&str] = &[":method", ":authority", ":scheme", ":path"];
