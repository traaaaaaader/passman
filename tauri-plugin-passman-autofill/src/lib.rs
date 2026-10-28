//! Tauri-плагин, который НЕ предоставляет команд для вызова из webview —
//! автозаполнение целиком управляется самой Android (пользователь нажимает
//! на поле пароля в ДРУГОМ приложении, система сама запускает
//! `PassmanAutofillService`). Единственная цель существования этого
//! крейта — чтобы `android/` подкаталог (Kotlin-код автозаполнения:
//! `PassmanAutofillService`, `UnlockActivity`, `BiometricVaultKeyStore`,
//! `VaultBridge`) автоматически подключался Gradle-модулем при каждом
//! `tauri android init` в приложении — без ручного копирования файлов и
//! правки `AndroidManifest.xml`/`build.gradle.kts` (см. `build.rs`).
//!
//! ⚠️ Эта схема (крейт-плагин, android/ подкаталог, build.rs с
//! `.android_path(...)`) собрана по документации и примерам Tauri — в этой
//! среде нет возможности прогнать реальный `tauri android init`/сборку
//! Gradle и убедиться, что модуль подключается автоматически именно так,
//! как ожидается. Если на реальной машине это не сработает — см.
//! `src-android/README.md` про резервный скрипт
//! `scripts/integrate-android-autofill.sh`, который делает то же самое
//! руками и уже проверен на реально сгенерированном проекте.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

#[cfg(target_os = "android")]
mod mobile;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("passman-autofill")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = mobile::init(_app, _api)?;
                _app.manage(handle);
            }
            Ok(())
        })
        .build()
}
