#ifndef PASSMAN_FFI_H
#define PASSMAN_FFI_H

#include <stdint.h>
#include <stddef.h>

/*
 * Должна побайтово совпадать с `#[repr(C)] struct PassmanResult` в
 * src-tauri/src/mobile_ffi.rs (секция `#[cfg(target_os = "ios")]`).
 *
 * - success: 1 при успехе, 0 при ошибке.
 * - data/data_len: при успехе — сырые байты результата (32-байтовый vault
 *   key для unlock, UTF-8 JSON для searchByDomain, UTF-8 пароль для
 *   getPassword); при ошибке — NULL/0.
 * - error: при ошибке — NUL-terminated UTF-8 сообщение; при успехе — NULL.
 *
 * Оба буфера (data и error) выделены в Rust-куче и ОБЯЗАТЕЛЬНО должны быть
 * освобождены вызовом passman_mobile_free_result — ровно один раз, после
 * того как вызывающая сторона скопировала нужные данные себе.
 */
typedef struct {
    int32_t success;
    uint8_t *data;
    size_t data_len;
    char *error;
} PassmanResult;

PassmanResult passman_mobile_unlock_with_password(
    const char *app_data_dir,
    const uint8_t *password,
    size_t password_len
);

PassmanResult passman_mobile_search_by_domain(
    const char *app_data_dir,
    const uint8_t *vault_key,
    size_t vault_key_len,
    const char *domain
);

PassmanResult passman_mobile_get_password(
    const char *app_data_dir,
    const uint8_t *vault_key,
    size_t vault_key_len,
    const char *entry_id
);

void passman_mobile_free_result(PassmanResult result);

#endif /* PASSMAN_FFI_H */
