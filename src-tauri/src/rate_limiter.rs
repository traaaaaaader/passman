//! Защита от локального перебора мастер-пароля: экспоненциальный backoff
//! после серии неудачных попыток разблокировки, персистентный между запусками
//! приложения. Логика повторяет `rateLimiter.js` из PearPass.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::model::RateLimitStatus;

const MAX_ATTEMPTS: u32 = 5;
const MAX_BACKOFF_MINUTES: i64 = 24 * 60;
const COOLDOWN_PERIOD_MS: i64 = MAX_BACKOFF_MINUTES * 60 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct RateLimitData {
    consecutive_failures: u32,
    lockout_until: Option<i64>,
    last_attempt_time: Option<i64>,
}

fn rate_limit_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("rate_limit.json")
}

fn load(app_data_dir: &Path) -> RateLimitData {
    fs::read_to_string(rate_limit_path(app_data_dir))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app_data_dir: &Path, data: &RateLimitData) {
    let Ok(json) = serde_json::to_string_pretty(data) else {
        return;
    };
    let _ = fs::create_dir_all(app_data_dir);
    let _ = fs::write(rate_limit_path(app_data_dir), json);
}

fn calculate_backoff_ms(consecutive_failures: u32) -> i64 {
    if consecutive_failures < MAX_ATTEMPTS {
        return 0;
    }
    let exponent = (consecutive_failures - MAX_ATTEMPTS + 1).min(32);
    let backoff_minutes = 2i64.saturating_pow(exponent);
    backoff_minutes.min(MAX_BACKOFF_MINUTES) * 60 * 1000
}

/// Если с последней попытки прошло больше суток — сбрасываем счётчик
/// («fresh start»), даже если пользователь так и не ввёл верный пароль.
fn apply_fresh_start(mut data: RateLimitData, now: i64) -> RateLimitData {
    if let Some(last) = data.last_attempt_time {
        if now - last >= COOLDOWN_PERIOD_MS {
            data = RateLimitData::default();
        }
    }
    data
}

pub fn status(app_data_dir: &Path) -> RateLimitStatus {
    let now = crate::store::now_ms();
    let data = apply_fresh_start(load(app_data_dir), now);

    if let Some(until) = data.lockout_until {
        if now < until {
            return RateLimitStatus {
                is_locked: true,
                lockout_remaining_ms: until - now,
                remaining_attempts: 0,
            };
        }
    }

    RateLimitStatus {
        is_locked: false,
        lockout_remaining_ms: 0,
        remaining_attempts: MAX_ATTEMPTS.saturating_sub(data.consecutive_failures),
    }
}

pub fn record_failure(app_data_dir: &Path) {
    let now = crate::store::now_ms();
    let mut data = apply_fresh_start(load(app_data_dir), now);

    if let Some(until) = data.lockout_until {
        if now >= until {
            data.lockout_until = None;
        }
    }

    data.consecutive_failures += 1;
    data.last_attempt_time = Some(now);
    let backoff = calculate_backoff_ms(data.consecutive_failures);
    data.lockout_until = if backoff > 0 {
        Some(now + backoff)
    } else {
        None
    };

    save(app_data_dir, &data);
}

pub fn reset(app_data_dir: &Path) {
    save(app_data_dir, &RateLimitData::default());
}
