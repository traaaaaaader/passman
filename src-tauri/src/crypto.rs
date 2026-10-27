//! Шифрование хранилища: Argon2id (мастер-пароль -> мастер-ключ) и
//! XChaCha20-Poly1305 (обёртка vault key и шифрование содержимого).
//! См. PROJECT.md раздел 1.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng as AeadOsRng};
use chacha20poly1305::{Key, XChaCha20Poly1305, XNonce};
use rand::RngCore;
use subtle::ConstantTimeEq;
use zeroize::{Zeroize, Zeroizing};

use crate::model::{KdfParams, SealedBox};

pub const KEY_LEN: usize = 32;
pub type VaultKey = Zeroizing<[u8; KEY_LEN]>;

// Параметры Argon2id. Memory-cost — главный рычаг против GPU/ASIC-перебора
// (он сильнее ops-cost требует реальной физической памяти на каждый
// параллельный поток подбора), поэтому на десктопе есть смысл взять его
// повыше. На мобильных — свой компромисс: слишком большой единовременный
// всплеск памяти рискует получить OOM-убийство процесса от ОС (у iOS это
// jetsam, у Android — low memory killer), особенно на бюджетных устройствах
// с 2-3 ГиБ RAM. 64 МиБ — это ровно `crypto_pwhash_MEMLIMIT_INTERACTIVE` из
// libsodium, тот же выбор, что и у PearPass для мобильных клиентов, —
// устоявшийся безопасный порог.
//
// Параметры читаются из файла хранилища при разблокировке (`KdfParams`), так
// что это значение влияет только на НОВЫЕ хранилища/смену пароля на данной
// платформе — старое хранилище продолжит разблокироваться со своими
// исходными параметрами независимо от того, где собрано приложение.
#[cfg(mobile)]
const MEMORY_KIB: u32 = 65_536; // 64 МиБ
#[cfg(not(mobile))]
const MEMORY_KIB: u32 = 131_072; // 128 МиБ

const ITERATIONS: u32 = 3;
const PARALLELISM: u32 = 1;

pub fn new_salt_hex() -> String {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    hex_encode(&salt)
}

pub fn default_kdf_params(salt: String) -> KdfParams {
    KdfParams {
        salt,
        memory_kib: MEMORY_KIB,
        iterations: ITERATIONS,
        parallelism: PARALLELISM,
    }
}

/// Argon2id: мастер-пароль -> мастер-ключ. Результат НИКОГДА не сохраняется —
/// используется немедленно, чтобы обернуть/развернуть vault key, и тут же
/// зануляется при выходе из области видимости (`Zeroizing`).
pub fn derive_master_key(password: &str, params: &KdfParams) -> Result<VaultKey, String> {
    let salt = hex_decode(&params.salt)?;
    let argon2_params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|e| format!("Некорректные параметры Argon2id: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon2_params);

    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    argon2
        .hash_password_into(password.as_bytes(), &salt, &mut key[..])
        .map_err(|e| format!("Не удалось вывести ключ: {e}"))?;
    Ok(key)
}

/// Случайный vault key — не зависит от пароля. Смена мастер-пароля перешивает
/// только его обёртку (`wrapped_key`), а не содержимое хранилища.
pub fn generate_key() -> VaultKey {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    rand::thread_rng().fill_bytes(&mut key[..]);
    key
}

pub fn seal(key: &[u8; KEY_LEN], plaintext: &[u8]) -> Result<SealedBox, String> {
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    let nonce = XChaCha20Poly1305::generate_nonce(&mut AeadOsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| "Ошибка шифрования".to_string())?;
    Ok(SealedBox {
        nonce: hex_encode(&nonce),
        ciphertext: hex_encode(&ciphertext),
    })
}

/// `None`, если ключ неверный (например, неверный мастер-пароль) — не сошёлся
/// тег аутентификации AEAD. Само по себе это и есть проверка пароля: никакого
/// отдельно хранимого хэша для сравнения не существует.
pub fn open(key: &[u8; KEY_LEN], sealed: &SealedBox) -> Option<Vec<u8>> {
    let nonce_bytes = hex_decode(&sealed.nonce).ok()?;
    let ciphertext = hex_decode(&sealed.ciphertext).ok()?;
    if nonce_bytes.len() != 24 {
        return None;
    }
    let nonce = XNonce::from_slice(&nonce_bytes);
    let cipher = XChaCha20Poly1305::new(Key::from_slice(key));
    cipher.decrypt(nonce, ciphertext.as_slice()).ok()
}

/// Константное по времени сравнение — используется при самопроверке новой
/// обёртки ключа после смены мастер-пароля, чтобы не давать таймингам течь
/// информацию о ключевом материале.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.ct_eq(b).into()
}

/// Явно зануляет буфер перед тем, как его разрешат уронить — для случаев
/// (например, `Vec<u8>` с распакованного vault key), которые не обёрнуты в
/// `Zeroizing` с самого начала.
pub fn wipe(mut bytes: Vec<u8>) {
    bytes.zeroize();
}

pub fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("Некорректная hex-строка".to_string());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "Некорректная hex-строка".to_string())
        })
        .collect()
}
