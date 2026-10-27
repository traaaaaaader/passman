use std::sync::Mutex;

use rand::Rng;
use tauri::State;
use zeroize::Zeroizing;

use crate::crypto;
use crate::model::{
    DEFAULT_SECTION_ID, Entry, EntryInput, EntrySummary, PairedDevice, PairingCode,
    RateLimitStatus, Section, Settings, VaultData, VaultFile, VaultStatus,
};
use crate::rate_limiter;
use crate::state::{AppState, PendingPairing};
use crate::store;

/// Алфавит для кода пэйринга: без 0/O, 1/I/L — чтобы код было легко
/// переписать вручную, не путая похожие символы.
const PAIRING_CODE_ALPHABET: &[u8] = b"23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PAIRING_CODE_LENGTH: usize = 12;
const PAIRING_CODE_GROUP_SIZE: usize = 4;

type AppStateHandle<'a> = State<'a, Mutex<AppState>>;

fn lock<'a>(state: &'a AppStateHandle<'a>) -> std::sync::MutexGuard<'a, AppState> {
    state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn lockout_message(minutes: i64) -> String {
    format!("Слишком много неудачных попыток. Повторите через {minutes} мин.")
}

#[tauri::command]
pub fn vault_status(state: AppStateHandle<'_>) -> VaultStatus {
    let guard = lock(&state);
    VaultStatus {
        initialized: store::vault_exists(&guard.app_data_dir),
        unlocked: guard.is_unlocked(),
    }
}

#[tauri::command]
pub fn rate_limit_status(state: AppStateHandle<'_>) -> RateLimitStatus {
    let guard = lock(&state);
    rate_limiter::status(&guard.app_data_dir)
}

#[tauri::command]
pub fn setup_master_password(state: AppStateHandle<'_>, password: String) -> Result<(), String> {
    // Исходная строка пришла из IPC как обычный `String` — заворачиваем её,
    // чтобы память с мастер-паролем гарантированно перезатёрлась нулями при
    // выходе из функции, а не просто освободилась для аллокатора.
    let password = Zeroizing::new(password);
    if password.chars().count() < 8 {
        return Err("Мастер-пароль должен быть не короче 8 символов".to_string());
    }
    let mut guard = lock(&state);
    if store::vault_exists(&guard.app_data_dir) {
        return Err("Хранилище уже создано".to_string());
    }

    let kdf = crypto::default_kdf_params(crypto::new_salt_hex());
    let master_key = crypto::derive_master_key(&password, &kdf)?;
    let vault_key = crypto::generate_key();
    let wrapped_key = crypto::seal(&master_key, vault_key.as_slice())?;

    let data = VaultData::new();
    let plaintext = serde_json::to_vec(&data)
        .map_err(|e| format!("Не удалось сериализовать хранилище: {e}"))?;
    let data_box = crypto::seal(&vault_key, &plaintext)?;

    let file = VaultFile {
        version: 2,
        kdf,
        wrapped_key,
        data: data_box,
    };
    store::save_vault_file(&guard.app_data_dir, &file)?;

    guard.vault_key = Some(vault_key);
    guard.data = Some(data);
    Ok(())
}

#[tauri::command]
pub fn unlock_vault(state: AppStateHandle<'_>, password: String) -> Result<(), String> {
    let password = Zeroizing::new(password);
    let mut guard = lock(&state);
    if guard.is_unlocked() {
        return Ok(());
    }

    let rl = rate_limiter::status(&guard.app_data_dir);
    if rl.is_locked {
        let minutes = (rl.lockout_remaining_ms as f64 / 60_000.0).ceil() as i64;
        return Err(lockout_message(minutes));
    }

    let file = store::load_vault_file(&guard.app_data_dir)?;
    let master_key = crypto::derive_master_key(&password, &file.kdf)?;

    let Some(vault_key_bytes) = crypto::open(&master_key, &file.wrapped_key) else {
        rate_limiter::record_failure(&guard.app_data_dir);
        let after = rate_limiter::status(&guard.app_data_dir);
        return Err(if after.is_locked {
            let minutes = (after.lockout_remaining_ms as f64 / 60_000.0).ceil() as i64;
            lockout_message(minutes)
        } else {
            format!(
                "Неверный мастер-пароль. Осталось попыток: {}",
                after.remaining_attempts
            )
        });
    };

    if vault_key_bytes.len() != crypto::KEY_LEN {
        crypto::wipe(vault_key_bytes);
        return Err("Повреждённый файл хранилища".to_string());
    }
    let mut vault_key = Zeroizing::new([0u8; crypto::KEY_LEN]);
    vault_key.copy_from_slice(&vault_key_bytes);
    crypto::wipe(vault_key_bytes);

    let plaintext = crypto::open(&vault_key, &file.data)
        .ok_or_else(|| "Повреждённый файл хранилища".to_string())?;
    let parsed: Result<VaultData, _> = serde_json::from_slice(&plaintext);
    crypto::wipe(plaintext);
    let data = parsed.map_err(|e| format!("Повреждённый файл хранилища: {e}"))?;

    rate_limiter::reset(&guard.app_data_dir);
    guard.vault_key = Some(vault_key);
    guard.data = Some(data);
    Ok(())
}

#[tauri::command]
pub fn lock_vault(state: AppStateHandle<'_>) {
    let mut guard = lock(&state);
    guard.lock();
}

#[tauri::command]
pub fn change_master_password(
    state: AppStateHandle<'_>,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    let old_password = Zeroizing::new(old_password);
    let new_password = Zeroizing::new(new_password);
    if new_password.chars().count() < 8 {
        return Err("Мастер-пароль должен быть не короче 8 символов".to_string());
    }
    let mut guard = lock(&state);
    if !guard.is_unlocked() {
        return Err("Хранилище заблокировано".to_string());
    }

    let file = store::load_vault_file(&guard.app_data_dir)?;

    // Повторно проверяем текущий пароль с нуля (а не доверяем, что хранилище
    // уже разблокировано в памяти) — защита в глубину перед сменой обёртки ключа.
    let old_master_key = crypto::derive_master_key(&old_password, &file.kdf)?;
    let Some(unwrapped) = crypto::open(&old_master_key, &file.wrapped_key) else {
        return Err("Текущий мастер-пароль указан неверно".to_string());
    };
    if unwrapped.len() != crypto::KEY_LEN {
        crypto::wipe(unwrapped);
        return Err("Повреждённый файл хранилища".to_string());
    }
    let mut vault_key = Zeroizing::new([0u8; crypto::KEY_LEN]);
    vault_key.copy_from_slice(&unwrapped);
    crypto::wipe(unwrapped);

    let new_kdf = crypto::default_kdf_params(crypto::new_salt_hex());
    let new_master_key = crypto::derive_master_key(&new_password, &new_kdf)?;
    let new_wrapped_key = crypto::seal(&new_master_key, vault_key.as_slice())?;

    // Прежде чем сохранять что-либо на диск, расшифровываем только что
    // записанную обёртку заново и сверяем константным временем — защита от
    // того, чтобы молча заблокировать пользователя из-за скрытого бага.
    let roundtrip = crypto::open(&new_master_key, &new_wrapped_key)
        .ok_or_else(|| "Не удалось подтвердить новый мастер-пароль".to_string())?;
    let roundtrip_ok = crypto::constant_time_eq(&roundtrip, vault_key.as_slice());
    crypto::wipe(roundtrip);
    if !roundtrip_ok {
        return Err("Не удалось подтвердить новый мастер-пароль".to_string());
    }

    let mut updated_file = file;
    updated_file.kdf = new_kdf;
    updated_file.wrapped_key = new_wrapped_key;
    store::save_vault_file(&guard.app_data_dir, &updated_file)?;

    guard.vault_key = Some(vault_key);
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: AppStateHandle<'_>) -> Result<Settings, String> {
    let guard = lock(&state);
    Ok(guard.data_ref()?.settings.clone())
}

#[tauri::command]
pub fn update_settings(state: AppStateHandle<'_>, settings: Settings) -> Result<Settings, String> {
    let mut guard = lock(&state);
    guard.data_mut()?.settings = settings;
    guard.persist()?;
    Ok(guard.data_ref()?.settings.clone())
}

#[tauri::command]
pub fn list_sections(state: AppStateHandle<'_>) -> Result<Vec<Section>, String> {
    let guard = lock(&state);
    Ok(guard.data_ref()?.sections.clone())
}

#[tauri::command]
pub fn create_section(
    state: AppStateHandle<'_>,
    name: String,
    color: String,
    parent_id: Option<String>,
) -> Result<Section, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Название раздела не может быть пустым".to_string());
    }
    let mut guard = lock(&state);
    let data = guard.data_mut()?;
    if let Some(ref pid) = parent_id {
        if !data.sections.iter().any(|s| &s.id == pid) {
            return Err("Родительский раздел не найден".to_string());
        }
    }
    let section = Section {
        id: store::new_id(),
        name,
        color,
        parent_id,
        created_at: store::now_ms(),
    };
    data.sections.push(section.clone());
    guard.persist()?;
    Ok(section)
}

#[tauri::command]
pub fn rename_section(
    state: AppStateHandle<'_>,
    id: String,
    name: String,
) -> Result<Section, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Название раздела не может быть пустым".to_string());
    }
    let mut guard = lock(&state);
    let data = guard.data_mut()?;
    let section = data
        .sections
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or_else(|| "Раздел не найден".to_string())?;
    section.name = name;
    let result = section.clone();
    guard.persist()?;
    Ok(result)
}

/// Удаляет раздел. Его непосредственные подразделы поднимаются на уровень
/// выше (их `parent_id` становится `parent_id` удаляемого раздела), а записи
/// переезжают в родительский раздел — или в «Общие», если удаляемый раздел
/// был верхнего уровня.
#[tauri::command]
pub fn delete_section(state: AppStateHandle<'_>, id: String) -> Result<(), String> {
    if id == DEFAULT_SECTION_ID {
        return Err("Раздел «Общие» нельзя удалить".to_string());
    }
    let mut guard = lock(&state);
    let data = guard.data_mut()?;
    let parent_id = data
        .sections
        .iter()
        .find(|s| s.id == id)
        .map(|s| s.parent_id.clone())
        .ok_or_else(|| "Раздел не найден".to_string())?;
    let fallback_section_id = parent_id
        .clone()
        .unwrap_or_else(|| DEFAULT_SECTION_ID.to_string());

    data.sections.retain(|s| s.id != id);
    for section in data.sections.iter_mut() {
        if section.parent_id.as_deref() == Some(id.as_str()) {
            section.parent_id = parent_id.clone();
        }
    }
    for entry in data.entries.iter_mut() {
        if entry.section_id == id {
            entry.section_id = fallback_section_id.clone();
        }
    }
    guard.persist()
}

#[tauri::command]
pub fn list_entries(
    state: AppStateHandle<'_>,
    section_id: Option<String>,
) -> Result<Vec<EntrySummary>, String> {
    let guard = lock(&state);
    let data = guard.data_ref()?;
    let mut entries: Vec<EntrySummary> = data
        .entries
        .iter()
        .filter(|e| {
            section_id
                .as_ref()
                .map(|sid| sid == &e.section_id)
                .unwrap_or(true)
        })
        .map(EntrySummary::from)
        .collect();
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

#[tauri::command]
pub fn get_entry_password(state: AppStateHandle<'_>, id: String) -> Result<String, String> {
    let guard = lock(&state);
    let data = guard.data_ref()?;
    data.entries
        .iter()
        .find(|e| e.id == id)
        .map(|e| e.password.clone())
        .ok_or_else(|| "Запись не найдена".to_string())
}

#[tauri::command]
pub fn create_entry(state: AppStateHandle<'_>, input: EntryInput) -> Result<EntrySummary, String> {
    if input.name.trim().is_empty() {
        return Err("Название записи не может быть пустым".to_string());
    }
    let mut guard = lock(&state);
    let now = store::now_ms();
    let entry = Entry {
        id: store::new_id(),
        section_id: input.section_id,
        name: input.name.trim().to_string(),
        password: input.password,
        description: input.description,
        link: input.link,
        created_at: now,
        updated_at: now,
    };
    let summary = EntrySummary::from(&entry);
    guard.data_mut()?.entries.push(entry);
    guard.persist()?;
    Ok(summary)
}

#[tauri::command]
pub fn update_entry(
    state: AppStateHandle<'_>,
    id: String,
    input: EntryInput,
) -> Result<EntrySummary, String> {
    if input.name.trim().is_empty() {
        return Err("Название записи не может быть пустым".to_string());
    }
    let mut guard = lock(&state);
    let data = guard.data_mut()?;
    let entry = data
        .entries
        .iter_mut()
        .find(|e| e.id == id)
        .ok_or_else(|| "Запись не найдена".to_string())?;
    entry.section_id = input.section_id;
    entry.name = input.name.trim().to_string();
    entry.password = input.password;
    entry.description = input.description;
    entry.link = input.link;
    entry.updated_at = store::now_ms();
    let summary = EntrySummary::from(&*entry);
    guard.persist()?;
    Ok(summary)
}

#[tauri::command]
pub fn delete_entry(state: AppStateHandle<'_>, id: String) -> Result<(), String> {
    let mut guard = lock(&state);
    let data = guard.data_mut()?;
    let len_before = data.entries.len();
    data.entries.retain(|e| e.id != id);
    if data.entries.len() == len_before {
        return Err("Запись не найдена".to_string());
    }
    guard.persist()
}

fn generate_pairing_code() -> String {
    let mut rng = rand::thread_rng();
    let raw: String = (0..PAIRING_CODE_LENGTH)
        .map(|_| {
            let idx = rng.gen_range(0..PAIRING_CODE_ALPHABET.len());
            PAIRING_CODE_ALPHABET[idx] as char
        })
        .collect();
    raw.as_bytes()
        .chunks(PAIRING_CODE_GROUP_SIZE)
        .map(|chunk| std::str::from_utf8(chunk).unwrap())
        .collect::<Vec<_>>()
        .join("-")
}

/// Генерация кода для пэйринга устройств.
///
/// ВАЖНО: это UI-заглушка — реального P2P-транспорта и криптографического
/// хендшейка (см. PROJECT.md раздел 3-4) пока нет. Код живёт только в памяти
/// текущего процесса и ни с кем по сети не согласуется.
#[tauri::command]
pub fn create_pairing_code(state: AppStateHandle<'_>) -> Result<PairingCode, String> {
    let mut guard = lock(&state);
    guard.data_ref()?;
    let pending = PendingPairing {
        code: generate_pairing_code(),
        expires_at: store::now_ms() + 5 * 60 * 1000,
    };
    let dto = pending.as_dto();
    guard.pending_pairing = Some(pending);
    Ok(dto)
}

#[tauri::command]
pub fn redeem_pairing_code(
    state: AppStateHandle<'_>,
    code: String,
    device_name: String,
) -> Result<PairedDevice, String> {
    let device_name = device_name.trim().to_string();
    if device_name.is_empty() {
        return Err("Укажите имя устройства".to_string());
    }
    let normalized: String = code
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect::<String>()
        .to_uppercase();
    let valid = normalized.len() == PAIRING_CODE_LENGTH
        && normalized
            .bytes()
            .all(|b| PAIRING_CODE_ALPHABET.contains(&b));
    if !valid {
        return Err(format!(
            "Код должен состоять из {PAIRING_CODE_LENGTH} символов (буквы и цифры)"
        ));
    }
    let mut guard = lock(&state);
    guard.data_ref()?;
    let device = PairedDevice {
        id: store::new_id(),
        name: device_name,
        paired_at: store::now_ms(),
    };
    guard.data_mut()?.paired_devices.push(device.clone());
    guard.persist()?;
    Ok(device)
}

#[tauri::command]
pub fn list_paired_devices(state: AppStateHandle<'_>) -> Result<Vec<PairedDevice>, String> {
    let guard = lock(&state);
    Ok(guard.data_ref()?.paired_devices.clone())
}

#[tauri::command]
pub fn remove_paired_device(state: AppStateHandle<'_>, id: String) -> Result<(), String> {
    let mut guard = lock(&state);
    let data = guard.data_mut()?;
    data.paired_devices.retain(|d| d.id != id);
    guard.persist()
}
