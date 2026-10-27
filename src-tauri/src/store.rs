use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rand::RngCore;

use crate::crypto::{self, VaultKey};
use crate::model::{VaultData, VaultFile};

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn new_id() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    crypto::hex_encode(&bytes)
}

fn vault_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("vault.json")
}

pub fn vault_exists(app_data_dir: &Path) -> bool {
    vault_path(app_data_dir).exists()
}

pub fn load_vault_file(app_data_dir: &Path) -> Result<VaultFile, String> {
    let path = vault_path(app_data_dir);
    let data =
        fs::read_to_string(&path).map_err(|e| format!("Не удалось прочитать хранилище: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("Повреждённый файл хранилища: {e}"))
}

pub fn save_vault_file(app_data_dir: &Path, file: &VaultFile) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("Не удалось создать директорию данных: {e}"))?;
    let json = serde_json::to_string_pretty(file)
        .map_err(|e| format!("Не удалось сериализовать хранилище: {e}"))?;
    fs::write(vault_path(app_data_dir), json)
        .map_err(|e| format!("Не удалось записать хранилище: {e}"))
}

/// Перешифровывает содержимое хранилища текущим vault key и сохраняет,
/// не трогая параметры KDF и обёртку ключа (`kdf`/`wrapped_key`) — те меняются
/// только при смене мастер-пароля.
pub fn save_data(
    app_data_dir: &Path,
    vault_key: &VaultKey,
    data: &VaultData,
) -> Result<(), String> {
    let mut file = load_vault_file(app_data_dir)?;
    let plaintext =
        serde_json::to_vec(data).map_err(|e| format!("Не удалось сериализовать хранилище: {e}"))?;
    let sealed = crypto::seal(vault_key, &plaintext);
    crypto::wipe(plaintext);
    file.data = sealed?;
    save_vault_file(app_data_dir, &file)
}
