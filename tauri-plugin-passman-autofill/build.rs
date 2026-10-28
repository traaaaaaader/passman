// Эта команда не предоставляет Rust-команд JS/invoke() — автозаполнение
// запускается самой ОС (AutofillService), а не из webview. Единственная
// задача этого build.rs — сообщить `tauri android init`, что у этого крейта
// есть каталог `android/`, который нужно подключить как Gradle-модуль.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
