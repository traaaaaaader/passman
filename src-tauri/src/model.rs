use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

/// Пользовательский раздел (категория) для группировки паролей.
///
/// `parent_id` позволяет строить дерево вложенных разделов — `None` значит
/// раздел верхнего уровня.
#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    pub name: String,
    pub color: String,
    pub parent_id: Option<String>,
    pub created_at: i64,
}

/// Полная запись пароля. Живёт только расшифрованной в памяти, пока
/// хранилище разблокировано — на диске лежит внутри единого зашифрованного
/// блока `VaultFile::data` (см. ниже). `ZeroizeOnDrop` гарантирует, что при
/// блокировке хранилища (`AppState::lock`) память с паролем не просто
/// освобождается, а сначала перезатирается нулями.
#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct Entry {
    pub id: String,
    pub section_id: String,
    pub name: String,
    pub password: String,
    pub description: String,
    pub link: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// DTO записи без секрета — то, что уходит в webview для списков.
/// Пароль запрашивается отдельной командой по явному действию пользователя.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntrySummary {
    pub id: String,
    pub section_id: String,
    pub name: String,
    pub description: String,
    pub link: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub password_length: usize,
}

impl From<&Entry> for EntrySummary {
    fn from(entry: &Entry) -> Self {
        EntrySummary {
            id: entry.id.clone(),
            section_id: entry.section_id.clone(),
            name: entry.name.clone(),
            description: entry.description.clone(),
            link: entry.link.clone(),
            created_at: entry.created_at,
            updated_at: entry.updated_at,
            password_length: entry.password.chars().count(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryInput {
    pub section_id: String,
    pub name: String,
    pub password: String,
    pub description: String,
    pub link: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct GeneratorDefaults {
    pub length: u32,
    pub uppercase: bool,
    pub lowercase: bool,
    pub digits: bool,
    pub symbols: bool,
}

impl Default for GeneratorDefaults {
    fn default() -> Self {
        GeneratorDefaults {
            length: 20,
            uppercase: true,
            lowercase: true,
            digits: true,
            symbols: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub generator: GeneratorDefaults,
    pub clipboard_clear_seconds: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            theme: "dark".to_string(),
            generator: GeneratorDefaults::default(),
            clipboard_clear_seconds: 20,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub paired_at: i64,
}

/// Расшифрованное содержимое хранилища — то, что живёт в памяти процесса,
/// пока vault разблокирован, и что (сериализованное в JSON) целиком
/// шифруется одним блоком XChaCha20-Poly1305 под vault key. `ZeroizeOnDrop` —
/// при `self.data = None` в `AppState::lock` вся расшифрованная память (все
/// пароли, названия разделов и т.д.) перезатирается нулями, а не просто
/// освобождается для повторного использования аллокатором.
#[derive(Debug, Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop)]
pub struct VaultData {
    pub sections: Vec<Section>,
    pub entries: Vec<Entry>,
    pub settings: Settings,
    pub paired_devices: Vec<PairedDevice>,
}

pub const DEFAULT_SECTION_ID: &str = "general";

impl VaultData {
    pub fn new() -> Self {
        let now = crate::store::now_ms();
        VaultData {
            sections: vec![Section {
                id: DEFAULT_SECTION_ID.to_string(),
                name: "Общие".to_string(),
                color: "slate".to_string(),
                parent_id: None,
                created_at: now,
            }],
            entries: Vec::new(),
            settings: Settings::default(),
            paired_devices: Vec::new(),
        }
    }
}

/// Параметры Argon2id, с которыми был выведен мастер-ключ для конкретного
/// хранилища. Хранятся в открытом виде — это не секрет: они нужны, чтобы при
/// разблокировке повторить тот же вывод ключа из пароля. Сам пароль и ключ,
/// который он выводит, нигде не сохраняются.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    pub salt: String,
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

/// Результат AEAD-шифрования: nonce + шифротекст (с тегом аутентификации),
/// оба в hex.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SealedBox {
    pub nonce: String,
    pub ciphertext: String,
}

/// Весь файл хранилища на диске.
///
/// `vault_key`, которым зашифровано поле `data`, нигде не хранится — только
/// обёрнутым под мастер-ключ (`wrapped_key`). Сам мастер-ключ тоже нигде не
/// хранится — он каждый раз заново выводится из мастер-пароля через Argon2id
/// с параметрами `kdf`. Проверка пароля — это сам факт успешной расшифровки
/// `wrapped_key` (совпал тег аутентификации AEAD), отдельного хэша для
/// сравнения не существует. См. PROJECT.md раздел 1.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
    pub version: u32,
    pub kdf: KdfParams,
    pub wrapped_key: SealedBox,
    pub data: SealedBox,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCode {
    pub code: String,
    pub expires_at: i64,
}

/// Статус rate-limiter'а разблокировки — отдаётся на фронт, чтобы показать
/// обратный отсчёт и отключить форму во время блокировки.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitStatus {
    pub is_locked: bool,
    pub lockout_remaining_ms: i64,
    pub remaining_attempts: u32,
}
