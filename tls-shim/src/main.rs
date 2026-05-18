//! agentic-tls-shim
//!
//! A localhost HTTP CONNECT proxy that terminates the browser's TLS
//! connection and re-establishes the outbound TLS connection with a
//! Chrome-coherent ClientHello. The browser sees a normal proxy;
//! upstream servers see a TLS handshake whose JA3 / JA4 / Akamai
//! fingerprints match Chrome stable for the configured version.
//!
//! Architecture:
//!
//!   Browser ──TLS──▸ shim ──Chrome-coherent TLS──▸ Origin
//!                  (MITM)        (JA3/JA4 match)
//!
//! The shim generates a local CA on first run. The browser must trust
//! this CA (AgenticBrowser's JS runtime configures Chromium to do so).
//! For each CONNECT target a short-lived leaf certificate is signed
//! so the browser's TLS handshake completes normally against the shim.
//! The shim then opens its own TLS connection to the origin with a
//! ClientHello whose cipher order, extensions, ALPN, and supported
//! groups match Chrome stable.

mod ca;
mod chrome_profile;

use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use clap::Parser;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tracing::{error, info, warn};

use ca::CaIssuer;

#[derive(Parser, Debug)]
#[command(version, about)]
struct Args {
    /// Listen address for incoming proxy connections.
    #[arg(long, default_value = "127.0.0.1:8443")]
    listen: SocketAddr,

    /// Chrome version to mimic (controls ClientHello / SETTINGS shape).
    #[arg(long, default_value = "138")]
    chrome_version: u32,

    /// Directory for the CA key/cert cache.
    #[arg(long)]
    data_dir: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let args = Args::parse();
    let data_dir = args
        .data_dir
        .as_deref()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(ca::default_data_dir);

    let ca = CaIssuer::load_or_create(&data_dir).await?;
    let profile = Arc::new(chrome_profile::ChromeProfile::for_version(args.chrome_version)?);

    info!(
        target: "shim",
        "listening on {} (Chrome profile {})",
        args.listen, args.chrome_version
    );
    info!("CA cert: {}", data_dir.join("ca.pem").display());

    let listener = TcpListener::bind(args.listen)
        .await
        .with_context(|| format!("bind {}", args.listen))?;

    loop {
        let (client, peer) = match listener.accept().await {
            Ok(x) => x,
            Err(e) => {
                error!("accept failed: {e}");
                continue;
            }
        };
        let ca = ca.clone();
        let prof = profile.clone();
        tokio::spawn(async move {
            if let Err(e) = handle(client, ca, prof).await {
                warn!(?peer, "connection ended: {e:#}");
            }
        });
    }
}

async fn handle(
    raw_client: TcpStream,
    ca: CaIssuer,
    profile: Arc<chrome_profile::ChromeProfile>,
) -> Result<()> {
    let mut client = raw_client;

    // Read HTTP CONNECT request
    let mut buf = vec![0u8; 8192];
    let mut filled = 0usize;
    loop {
        if filled == buf.len() {
            return Err(anyhow!("header overflow"));
        }
        let n = client.read(&mut buf[filled..]).await?;
        if n == 0 {
            return Err(anyhow!("client closed before request"));
        }
        filled += n;
        if buf[..filled].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }

    let head = std::str::from_utf8(&buf[..filled])?;
    let mut lines = head.split("\r\n");
    let request_line = lines.next().ok_or_else(|| anyhow!("empty request"))?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");

    if method != "CONNECT" {
        let _ = client
            .write_all(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n")
            .await;
        return Err(anyhow!("only CONNECT supported; got {method}"));
    }

    let (host, port) = parse_host_port(target).context("parse CONNECT target")?;

    // Tell the browser the tunnel is ready.
    client
        .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        .await?;

    // Phase 1: accept the browser's TLS handshake (MITM).
    // We present a leaf cert signed by our CA for this hostname.
    let (cert_chain, priv_key) = ca.sign_leaf(&host).await?;
    let server_tls = accept_client_tls(client, cert_chain, priv_key).await?;

    // Phase 2: open Chrome-coherent outbound TLS to the origin.
    let upstream_tcp = TcpStream::connect((host.as_str(), port))
        .await
        .with_context(|| format!("connect {host}:{port}"))?;
    let client_tls = profile.connect(upstream_tcp, &host).await?;

    // Phase 3: splice the two TLS streams.
    tls_splice(server_tls, client_tls).await
}

/// Accept an incoming TLS connection using our generated leaf cert.
async fn accept_client_tls(
    stream: TcpStream,
    cert_chain: Vec<rustls::pki_types::CertificateDer<'static>>,
    priv_key: rustls::pki_types::PrivateKeyDer<'static>,
) -> Result<tokio_rustls::server::TlsStream<TcpStream>> {
    let mut server_config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(cert_chain, priv_key)?;

    // Match Chrome's TLS 1.3 preference
    server_config.max_early_data_size = 0;
    server_config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];

    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(server_config));
    let tls = acceptor.accept(stream).await?;
    Ok(tls)
}

/// Bridge two TLS streams: bytes from each side are forwarded to the other.
async fn tls_splice(
    server_tls: tokio_rustls::server::TlsStream<TcpStream>,
    client_tls: tokio_rustls::client::TlsStream<TcpStream>,
) -> Result<()> {
    let (mut sr, mut sw) = tokio::io::split(server_tls);
    let (mut cr, mut cw) = tokio::io::split(client_tls);

    let browser_to_origin = tokio::io::copy(&mut sr, &mut cw);
    let origin_to_browser = tokio::io::copy(&mut cr, &mut sw);
    tokio::try_join!(browser_to_origin, origin_to_browser)?;
    Ok(())
}

fn parse_host_port(target: &str) -> Result<(String, u16)> {
    let (h, p) = target
        .rsplit_once(':')
        .ok_or_else(|| anyhow!("missing port: {target}"))?;
    let h = h
        .trim_start_matches('[')
        .trim_end_matches(']');
    Ok((h.to_string(), p.parse()?))
}
