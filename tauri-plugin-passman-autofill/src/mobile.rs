use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Runtime};

/// Хендл на зарегистрированный Kotlin-класс плагина. Команд через него не
/// вызываем (см. комментарий в lib.rs) — хендл нужен только чтобы
/// Tauri-раннтайм на Android корректно знал об этом плагине при старте
/// приложения.
pub struct PassmanAutofillHandle<R: Runtime>(#[allow(dead_code)] PluginHandle<R>);

pub fn init<R: Runtime>(
    _app: &AppHandle<R>,
    api: PluginApi<R, ()>,
) -> tauri::Result<PassmanAutofillHandle<R>> {
    let handle =
        api.register_android_plugin("com.trader.passman.autofill", "PassmanAutofillPlugin")?;
    Ok(PassmanAutofillHandle(handle))
}
