//! Сопоставление домена записи с доменом страницы/приложения —
//! используется и WS-мостом для браузера (`bridge.rs`), и мобильным
//! FFI-слоем для системного автозаполнения (`mobile_ffi.rs`). Общий код,
//! чтобы правило сопоставления было ровно одно, а не две параллельные
//! реализации, которые могут незаметно разойтись.

/// Точное совпадение хоста или его поддомен — никогда подстрока/суффикс без
/// точки (иначе `evil-example.com` совпал бы с `example.com`).
pub fn domain_matches(stored_host: &str, requested_host: &str) -> bool {
    stored_host == requested_host || requested_host.ends_with(&format!(".{stored_host}"))
}

/// Достаёт хост из поля "ссылка" записи. Поле необязательно содержит схему
/// (`https://...`) — если `Url::parse` не справился, пробуем как если бы
/// пользователь ввёл просто домен без схемы.
pub fn entry_host(link: &str) -> Option<String> {
    let link = link.trim();
    if link.is_empty() {
        return None;
    }
    let parsed = url::Url::parse(link)
        .or_else(|_| url::Url::parse(&format!("https://{link}")))
        .ok()?;
    parsed.host_str().map(|h| h.to_lowercase())
}
