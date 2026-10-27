use std::path::PathBuf;

use crate::crypto::VaultKey;
use crate::model::{PairingCode, VaultData};

pub struct PendingPairing {
    pub code: String,
    pub expires_at: i64,
}

impl PendingPairing {
    pub fn as_dto(&self) -> PairingCode {
        PairingCode {
            code: self.code.clone(),
            expires_at: self.expires_at,
        }
    }
}

pub struct AppState {
    pub app_data_dir: PathBuf,
    /// Vault key в памяти, пока хранилище разблокировано. Зануляется при
    /// `Drop` (`Zeroizing`), в том числе при блокировке и смене мастер-пароля.
    pub vault_key: Option<VaultKey>,
    pub data: Option<VaultData>,
    pub pending_pairing: Option<PendingPairing>,
}

impl AppState {
    pub fn new(app_data_dir: PathBuf) -> Self {
        AppState {
            app_data_dir,
            vault_key: None,
            data: None,
            pending_pairing: None,
        }
    }

    pub fn is_unlocked(&self) -> bool {
        self.vault_key.is_some() && self.data.is_some()
    }

    pub fn data_mut(&mut self) -> Result<&mut VaultData, String> {
        self.data
            .as_mut()
            .ok_or_else(|| "Хранилище заблокировано".to_string())
    }

    pub fn data_ref(&self) -> Result<&VaultData, String> {
        self.data
            .as_ref()
            .ok_or_else(|| "Хранилище заблокировано".to_string())
    }

    pub fn lock(&mut self) {
        self.vault_key = None;
        self.data = None;
        self.pending_pairing = None;
    }

    pub fn persist(&self) -> Result<(), String> {
        let vault_key = self
            .vault_key
            .as_ref()
            .ok_or_else(|| "Хранилище заблокировано".to_string())?;
        let data = self.data_ref()?;
        crate::store::save_data(&self.app_data_dir, vault_key, data)
    }
}
