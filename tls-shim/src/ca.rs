//! Local CA and per-host certificate generation.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use rcgen::{CertificateParams, DnType, IsCa, KeyPair};
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use tokio::sync::Mutex;
use tracing::info;

struct Ca {
    cert_pem: String,
    key: KeyPair,
    params: CertificateParams,
}

#[derive(Clone)]
pub struct CaIssuer {
    inner: Arc<Mutex<Ca>>,
}

impl CaIssuer {
    pub async fn load_or_create(data_dir: &Path) -> Result<Self> {
        let cert_path = data_dir.join("ca.pem");
        let key_path = data_dir.join("ca.key");

        if cert_path.exists() && key_path.exists() {
            let key_pem = tokio::fs::read_to_string(&key_path).await?;
            let key = KeyPair::from_pem(&key_pem).context("parse CA key")?;
            let cert_pem = tokio::fs::read_to_string(&cert_path).await?;
            let params = CertificateParams::default();

            info!("loaded cached CA from {}", cert_path.display());
            return Ok(Self {
                inner: Arc::new(Mutex::new(Ca { cert_pem, key, params })),
            });
        }

        let mut params = CertificateParams::default();
        params.distinguished_name.push(DnType::CommonName, "AgenticBrowser CA");
        params.distinguished_name.push(DnType::OrganizationName, "AgenticBrowser");
        params.is_ca = IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
        params.key_usages.push(rcgen::KeyUsagePurpose::KeyCertSign);
        params.key_usages.push(rcgen::KeyUsagePurpose::CrlSign);

        let key = KeyPair::generate()?;
        let cert = params.self_signed(&key)?;
        let cert_pem = cert.pem();

        tokio::fs::create_dir_all(data_dir).await.ok();
        tokio::fs::write(&cert_path, &cert_pem).await?;
        tokio::fs::write(&key_path, key.serialize_pem()).await?;
        info!("generated new CA at {}", cert_path.display());

        Ok(Self {
            inner: Arc::new(Mutex::new(Ca { cert_pem, key, params })),
        })
    }

    pub async fn ca_cert_pem(&self) -> String {
        self.inner.lock().await.cert_pem.clone()
    }

    pub async fn sign_leaf(
        &self,
        hostname: &str,
    ) -> Result<(Vec<CertificateDer<'static>>, PrivateKeyDer<'static>)> {
        let ca = self.inner.lock().await;

        let mut params = CertificateParams::default();
        params.distinguished_name.push(DnType::CommonName, hostname);
        params.subject_alt_names.push(rcgen::SanType::DnsName(hostname.try_into()?));
        if !hostname.starts_with("*.") {
            let wildcard = format!("*.{}", hostname);
            params.subject_alt_names.push(rcgen::SanType::DnsName(wildcard.try_into()?));
        }

        let leaf_key = KeyPair::generate()?;
        let issuer = rcgen::Issuer::new(ca.params.clone(), &ca.key);
        let leaf_cert = params.signed_by(&leaf_key, &issuer)?;

        let cert_chain = vec![CertificateDer::from(leaf_cert.der().to_vec())];
        let priv_key = PrivateKeyDer::Pkcs8(leaf_key.serialize_der().into());
        Ok((cert_chain, priv_key))
    }
}

pub fn default_data_dir() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/tmp"))
        .join(".agentic-browser")
}
