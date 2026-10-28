//! FFI-слой для системного автозаполнения на мобильных платформах
//! (Android `AutofillService`, iOS `ASCredentialProviderExtension`) — см.
//! `src-android/` и `src-ios/`.
//!
//! Архитектурное решение (обсуждалось отдельно): биометрия/Keychain —
//! платформенные механизмы, их здесь нет и не должно быть. Эта сторона
//! отвечает только за "дайте мне пароль или 32-байтовый vault key — а я
//! расшифрую хранилище и отвечу" — то есть за ровно ту же логику, что уже
//! есть в `commands.rs`/`bridge.rs`, но вызываемую не из Tauri IPC/WebSocket,
//! а напрямую через JNI (Android) или C ABI (iOS) из нативного кода
//! расширения. Поэтому здесь переиспользуется `crypto.rs`/`store.rs`/
//! `domain_match.rs`, а не пишется вторая копия шифрования.
//!
//! # КРИТИЧЕСКИ ВАЖНО: паника не должна обрушивать чужой процесс
//!
//! Этот код вызывается из системного сервиса автозаполнения, который
//! работает ВНУТРИ процесса того приложения, где пользователь нажал на поле
//! пароля (браузера, почтового клиента и т.п. на Android; на iOS — в
//! процессе самого расширения, но крах расширения всё равно задевает
//! системный UI автозаполнения). Паника где угодно в вызываемом коде ДОЛЖНА
//! быть перехвачена `catch_unwind` и превращена в обычную ошибку — иначе
//! она обрушит хост-процесс, а не только покажет "не удалось".
//!
//! Это работает только при размотке стека при панике (`panic = "unwind"`).
//! В `Cargo.toml` для десктоп-профиля стоит `panic = "abort"` (осознанный
//! выбор для размера десктоп-бинаря) — мобильные сборки ОБЯЗАНЫ
//! переопределять это флагом компилятора:
//! `RUSTFLAGS="-C panic=unwind" cargo build --target <android/ios-target> --release`.
//! См. комментарий в `Cargo.toml` и `.github/workflows/build.yml`.
//!
//! # Владение памятью через границу FFI
//!
//! Любой буфер (байты/строка), который эти функции возвращают вызывающей
//! стороне, выделен в Rust-куче и должен быть явно освобождён вызовом
//! `passman_mobile_free_result` (iOS) — для Android JNI освобождение берёт
//! на себя JVM (возвращаем обычные `jbyteArray`/`jstring`, которые сборщик
//! мусора заберёт сам). Пароли и vault key, попавшие в Kotlin/Swift,
//! обязаны быть обнулены вызывающей стороной после использования — Rust не
//! может это гарантировать за границей FFI, но сам обнуляет свои копии
//! (`Zeroizing`/`crypto::wipe`) сразу после использования.

// Общая логика ниже используется только из cfg-гейтнутых android/ios
// подмодулей — на десктопе (сборка/проверка на этой машине) она неизбежно
// "не используется", что и так ожидаемо.
#![cfg_attr(
    not(any(target_os = "android", target_os = "ios")),
    allow(dead_code, unused_imports)
)]

use std::path::Path;

use serde::Serialize;
use zeroize::Zeroizing;

use crate::crypto::{self, VaultKey};
use crate::domain_match::{domain_matches, entry_host};
use crate::model::VaultData;
use crate::store;

/// Общая маска сообщения об ошибке при панике — специально не передаём
/// наружу исходное сообщение паники: оно может случайно содержать значение
/// из отладочного `assert!`/`unwrap()` рядом с конфиденциальными данными.
const INTERNAL_ERROR: &str = "Внутренняя ошибка Passman";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MobileEntryMatch {
    id: String,
    name: String,
    link: String,
}

fn unlock_with_password(app_data_dir: &Path, password: &str) -> Result<VaultKey, String> {
    let file = store::load_vault_file(app_data_dir)?;
    let master_key = crypto::derive_master_key(password, &file.kdf)?;
    let Some(vault_key_bytes) = crypto::open(&master_key, &file.wrapped_key) else {
        return Err("Неверный мастер-пароль".to_string());
    };
    if vault_key_bytes.len() != crypto::KEY_LEN {
        crypto::wipe(vault_key_bytes);
        return Err("Повреждённый файл хранилища".to_string());
    }
    let mut vault_key = Zeroizing::new([0u8; crypto::KEY_LEN]);
    vault_key.copy_from_slice(&vault_key_bytes);
    crypto::wipe(vault_key_bytes);
    Ok(vault_key)
}

fn load_decrypted_data(app_data_dir: &Path, vault_key: &VaultKey) -> Result<VaultData, String> {
    let file = store::load_vault_file(app_data_dir)?;
    let plaintext =
        crypto::open(vault_key, &file.data).ok_or_else(|| "Неверный ключ хранилища".to_string())?;
    let parsed: Result<VaultData, _> = serde_json::from_slice(&plaintext);
    crypto::wipe(plaintext);
    parsed.map_err(|e| format!("Повреждённый файл хранилища: {e}"))
}

fn search_by_domain(
    app_data_dir: &Path,
    vault_key: &VaultKey,
    domain: &str,
) -> Result<Vec<MobileEntryMatch>, String> {
    let data = load_decrypted_data(app_data_dir, vault_key)?;
    let domain = domain.trim().to_lowercase();
    if domain.is_empty() {
        return Ok(Vec::new());
    }
    Ok(data
        .entries
        .iter()
        .filter(|e| {
            entry_host(&e.link)
                .map(|host| domain_matches(&host, &domain))
                .unwrap_or(false)
        })
        .map(|e| MobileEntryMatch {
            id: e.id.clone(),
            name: e.name.clone(),
            link: e.link.clone(),
        })
        .collect())
}

fn get_entry_password(
    app_data_dir: &Path,
    vault_key: &VaultKey,
    entry_id: &str,
) -> Result<String, String> {
    let data = load_decrypted_data(app_data_dir, vault_key)?;
    data.entries
        .iter()
        .find(|e| e.id == entry_id)
        .map(|e| e.password.clone())
        .ok_or_else(|| "Запись не найдена".to_string())
}

fn vault_key_from_bytes(bytes: &[u8]) -> Result<VaultKey, String> {
    if bytes.len() != crypto::KEY_LEN {
        return Err("Некорректная длина ключа хранилища".to_string());
    }
    let mut key = Zeroizing::new([0u8; crypto::KEY_LEN]);
    key.copy_from_slice(bytes);
    Ok(key)
}

// ============================================================================
// Android (JNI)
// ============================================================================

#[cfg(target_os = "android")]
mod android {
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::path::Path;

    use jni::JNIEnv;
    use jni::objects::{JByteArray, JClass, JString};
    use jni::sys::jbyteArray;
    use zeroize::Zeroizing;

    use super::{
        INTERNAL_ERROR, get_entry_password, search_by_domain, unlock_with_password,
        vault_key_from_bytes,
    };

    /// Бросает Java-исключение `java/lang/Exception` с заданным сообщением.
    /// Используется вместо возврата кода ошибки — идиоматично для JNI,
    /// Kotlin просто оборачивает вызовы в `try`/`catch`.
    fn throw(env: &mut JNIEnv, message: &str) {
        // Если бросить исключение не удалось (например, JVM уже в процессе
        // завершения) — молча игнорируем, вызывающая сторона получит null.
        let _ = env.throw_new("java/lang/Exception", message);
    }

    fn jstring_to_string(env: &mut JNIEnv, s: &JString) -> Result<String, String> {
        env.get_string(s)
            .map(|s| s.to_string_lossy().into_owned())
            .map_err(|_| "Некорректная строка".to_string())
    }

    fn jbytearray_to_vec(env: &mut JNIEnv, arr: &JByteArray) -> Result<Vec<u8>, String> {
        env.convert_byte_array(arr)
            .map_err(|_| "Некорректный массив байт".to_string())
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_com_trader_passman_autofill_VaultBridge_unlockWithPassword(
        mut env: JNIEnv,
        _class: JClass,
        app_data_dir: JString,
        password: JByteArray,
    ) -> jbyteArray {
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<Vec<u8>, String> {
            let dir = jstring_to_string(&mut env, &app_data_dir)?;
            let mut password_bytes = jbytearray_to_vec(&mut env, &password)?;
            let password_str = String::from_utf8(password_bytes.clone())
                .map_err(|_| "Пароль должен быть в UTF-8".to_string());
            // Обнуляем собственную копию байт пароля независимо от того,
            // как парсинг завершился — она больше не нужна дальше по коду.
            zeroize::Zeroize::zeroize(&mut password_bytes);
            let password_str = Zeroizing::new(password_str?);
            let key = unlock_with_password(Path::new(&dir), &password_str)?;
            Ok(key.to_vec())
        }));

        match result {
            Ok(Ok(key_bytes)) => match env.byte_array_from_slice(&key_bytes) {
                Ok(arr) => arr.into_raw(),
                Err(_) => {
                    throw(&mut env, INTERNAL_ERROR);
                    std::ptr::null_mut()
                }
            },
            Ok(Err(message)) => {
                throw(&mut env, &message);
                std::ptr::null_mut()
            }
            Err(_panic) => {
                throw(&mut env, INTERNAL_ERROR);
                std::ptr::null_mut()
            }
        }
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_com_trader_passman_autofill_VaultBridge_searchByDomain<'local>(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        app_data_dir: JString<'local>,
        vault_key: JByteArray<'local>,
        domain: JString<'local>,
    ) -> jni::sys::jstring {
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<String, String> {
            let dir = jstring_to_string(&mut env, &app_data_dir)?;
            let key_bytes = jbytearray_to_vec(&mut env, &vault_key)?;
            let key = vault_key_from_bytes(&key_bytes)?;
            let domain_str = jstring_to_string(&mut env, &domain)?;
            let matches = search_by_domain(Path::new(&dir), &key, &domain_str)?;
            serde_json::to_string(&matches).map_err(|_| INTERNAL_ERROR.to_string())
        }));

        match result {
            Ok(Ok(json)) => match env.new_string(json) {
                Ok(s) => s.into_raw(),
                Err(_) => std::ptr::null_mut(),
            },
            Ok(Err(message)) => {
                throw(&mut env, &message);
                std::ptr::null_mut()
            }
            Err(_panic) => {
                throw(&mut env, INTERNAL_ERROR);
                std::ptr::null_mut()
            }
        }
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_com_trader_passman_autofill_VaultBridge_getPassword<'local>(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        app_data_dir: JString<'local>,
        vault_key: JByteArray<'local>,
        entry_id: JString<'local>,
    ) -> jni::sys::jstring {
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<String, String> {
            let dir = jstring_to_string(&mut env, &app_data_dir)?;
            let key_bytes = jbytearray_to_vec(&mut env, &vault_key)?;
            let key = vault_key_from_bytes(&key_bytes)?;
            let entry_id_str = jstring_to_string(&mut env, &entry_id)?;
            get_entry_password(Path::new(&dir), &key, &entry_id_str)
        }));

        match result {
            Ok(Ok(password)) => match env.new_string(password) {
                Ok(s) => s.into_raw(),
                Err(_) => std::ptr::null_mut(),
            },
            Ok(Err(message)) => {
                throw(&mut env, &message);
                std::ptr::null_mut()
            }
            Err(_panic) => {
                throw(&mut env, INTERNAL_ERROR);
                std::ptr::null_mut()
            }
        }
    }
}

// ============================================================================
// iOS (C ABI) — функции экспортируются из этого же `cdylib`/`staticlib`
// (см. `crate-type` в Cargo.toml), отдельная библиотека не нужна.
// ============================================================================

#[cfg(target_os = "ios")]
pub mod ios {
    use std::ffi::{CStr, CString, c_char};
    use std::path::Path;

    use super::*;

    /// Результат вызова — см. заголовок `src-ios/PassmanFFI/passman_ffi.h`
    /// (должен побайтово совпадать с этим `#[repr(C)]`).
    #[repr(C)]
    pub struct PassmanResult {
        pub success: i32,
        pub data: *mut u8,
        pub data_len: usize,
        pub error: *mut c_char,
    }

    fn ok_result(mut bytes: Vec<u8>) -> PassmanResult {
        let ptr = bytes.as_mut_ptr();
        let len = bytes.len();
        std::mem::forget(bytes);
        PassmanResult {
            success: 1,
            data: ptr,
            data_len: len,
            error: std::ptr::null_mut(),
        }
    }

    fn err_result(message: &str) -> PassmanResult {
        let c_message = CString::new(message).unwrap_or_else(|_| {
            CString::new(INTERNAL_ERROR).expect("constant string has no NUL bytes")
        });
        PassmanResult {
            success: 0,
            data: std::ptr::null_mut(),
            data_len: 0,
            error: c_message.into_raw(),
        }
    }

    /// `ptr` может быть NULL (трактуется как ошибка, а не UB) — защита от
    /// некорректного вызова со стороны Swift.
    unsafe fn cstr_to_string(ptr: *const c_char) -> Result<String, String> {
        if ptr.is_null() {
            return Err("Некорректный аргумент".to_string());
        }
        unsafe { CStr::from_ptr(ptr) }
            .to_str()
            .map(|s| s.to_string())
            .map_err(|_| "Строка должна быть в UTF-8".to_string())
    }

    unsafe fn bytes_from_raw(ptr: *const u8, len: usize) -> Result<Vec<u8>, String> {
        if ptr.is_null() {
            return Err("Некорректный аргумент".to_string());
        }
        Ok(unsafe { std::slice::from_raw_parts(ptr, len) }.to_vec())
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn passman_mobile_unlock_with_password(
        app_data_dir: *const c_char,
        password: *const u8,
        password_len: usize,
    ) -> PassmanResult {
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<Vec<u8>, String> {
            let dir = unsafe { cstr_to_string(app_data_dir) }?;
            let mut password_bytes = unsafe { bytes_from_raw(password, password_len) }?;
            let password_str = String::from_utf8(password_bytes.clone())
                .map_err(|_| "Пароль должен быть в UTF-8".to_string());
            zeroize::Zeroize::zeroize(&mut password_bytes);
            let password_str = Zeroizing::new(password_str?);
            let key = unlock_with_password(Path::new(&dir), &password_str)?;
            Ok(key.to_vec())
        }));

        match result {
            Ok(Ok(bytes)) => ok_result(bytes),
            Ok(Err(message)) => err_result(&message),
            Err(_panic) => err_result(INTERNAL_ERROR),
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn passman_mobile_search_by_domain(
        app_data_dir: *const c_char,
        vault_key: *const u8,
        vault_key_len: usize,
        domain: *const c_char,
    ) -> PassmanResult {
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<Vec<u8>, String> {
            let dir = unsafe { cstr_to_string(app_data_dir) }?;
            let key_bytes = unsafe { bytes_from_raw(vault_key, vault_key_len) }?;
            let key = vault_key_from_bytes(&key_bytes)?;
            let domain_str = unsafe { cstr_to_string(domain) }?;
            let matches = search_by_domain(Path::new(&dir), &key, &domain_str)?;
            serde_json::to_vec(&matches).map_err(|_| INTERNAL_ERROR.to_string())
        }));

        match result {
            Ok(Ok(json_bytes)) => ok_result(json_bytes),
            Ok(Err(message)) => err_result(&message),
            Err(_panic) => err_result(INTERNAL_ERROR),
        }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn passman_mobile_get_password(
        app_data_dir: *const c_char,
        vault_key: *const u8,
        vault_key_len: usize,
        entry_id: *const c_char,
    ) -> PassmanResult {
        let result = catch_unwind(AssertUnwindSafe(|| -> Result<Vec<u8>, String> {
            let dir = unsafe { cstr_to_string(app_data_dir) }?;
            let key_bytes = unsafe { bytes_from_raw(vault_key, vault_key_len) }?;
            let key = vault_key_from_bytes(&key_bytes)?;
            let entry_id_str = unsafe { cstr_to_string(entry_id) }?;
            let password = get_entry_password(Path::new(&dir), &key, &entry_id_str)?;
            Ok(password.into_bytes())
        }));

        match result {
            Ok(Ok(bytes)) => ok_result(bytes),
            Ok(Err(message)) => err_result(&message),
            Err(_panic) => err_result(INTERNAL_ERROR),
        }
    }

    /// Освобождает буферы внутри результата. Безопасно вызывать даже если
    /// `data`/`error` уже null. Обязателен к вызову Swift-стороной после
    /// каждого успешного или неуспешного результата.
    #[unsafe(no_mangle)]
    pub extern "C" fn passman_mobile_free_result(result: PassmanResult) {
        if !result.data.is_null() {
            let _ = unsafe { Vec::from_raw_parts(result.data, result.data_len, result.data_len) };
        }
        if !result.error.is_null() {
            let _ = unsafe { CString::from_raw(result.error) };
        }
    }
}
