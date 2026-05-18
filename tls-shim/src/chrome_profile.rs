//! Chrome-coherent TLS / HTTP-2 profile.

use std::sync::Arc;

use anyhow::Result;
use rustls::crypto::ring::default_provider;
use rustls::pki_types::ServerName;
use rustls::{ClientConfig, RootCertStore, SupportedCipherSuite};
use tokio::net::TcpStream;
use tracing::debug;

pub struct ChromeProfile {
    pub version: u32,
    client_config: Arc<ClientConfig>,
}

impl ChromeProfile {
    pub fn for_version(version: u32) -> Result<Self> {
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

        // Pick cipher suites from rustls's available set in Chrome's preferred order.
        let provider = default_provider();
        let available = &provider.cipher_suites;
        let chrome_ciphers: Vec<SupportedCipherSuite> = PREFERRED_SUITES
            .iter()
            .filter_map(|target| available.iter().find(|s| format!("{:?}", s).contains(target)).copied())
            .collect();

        let custom_provider = Arc::new(rustls::crypto::CryptoProvider {
            cipher_suites: if chrome_ciphers.is_empty() {
                provider.cipher_suites.clone()
            } else {
                chrome_ciphers
            },
            kx_groups: vec![
                rustls::crypto::ring::kx_group::X25519,
                rustls::crypto::ring::kx_group::SECP256R1,
                rustls::crypto::ring::kx_group::SECP384R1,
            ],
            ..provider
        });

        let mut config = ClientConfig::builder_with_provider(custom_provider)
            .with_safe_default_protocol_versions()
            .map_err(|e| anyhow::anyhow!("protocol versions: {e}"))?
            .with_root_certificates(roots)
            .with_no_client_auth();

        config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
        config.enable_sni = true;

        Ok(Self {
            version,
            client_config: Arc::new(config),
        })
    }

    pub async fn connect(
        &self,
        stream: TcpStream,
        host: &str,
    ) -> Result<tokio_rustls::client::TlsStream<TcpStream>> {
        let name = ServerName::try_from(host.to_string())?;
        let connector = tokio_rustls::TlsConnector::from(self.client_config.clone());
        let tls = connector.connect(name, stream).await?;
        debug!("outbound TLS to {} established", host);
        Ok(tls)
    }
}

/// Substrings to match against rustls's Debug output for each cipher suite,
/// listed in Chrome's preferred order.
const PREFERRED_SUITES: &[&str] = &[
    "TLS13_AES_128_GCM_SHA256",
    "TLS13_AES_256_GCM_SHA384",
    "TLS13_CHACHA20_POLY1305_SHA256",
    "ECDHE_ECDSA_AES_128_GCM_SHA256",
    "ECDHE_RSA_AES_128_GCM_SHA256",
    "ECDHE_ECDSA_AES_256_GCM_SHA384",
    "ECDHE_RSA_AES_256_GCM_SHA384",
    "ECDHE_ECDSA_CHACHA20_POLY1305",
    "ECDHE_RSA_CHACHA20_POLY1305",
];

pub const CHROME_138_H2_SETTINGS: &[(u16, u32)] = &[
    (0x01, 65536),
    (0x02, 0),
    (0x04, 6291456),
    (0x06, 262144),
];

pub const CHROME_PSEUDO_HEADER_ORDER: &[&str] =
    &[":method", ":authority", ":scheme", ":path"];
