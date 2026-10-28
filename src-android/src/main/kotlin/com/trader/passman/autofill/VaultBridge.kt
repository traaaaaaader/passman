package com.trader.passman.autofill

/**
 * Тонкий мост к Rust-ядру (см. `src-tauri/src/mobile_ffi.rs`). Вся логика
 * расшифровки и поиска — там; здесь только объявления `external fun` и
 * загрузка той же нативной библиотеки, которую уже использует основное
 * приложение (Tauri грузит её для `MainActivity`).
 *
 * Все три функции бросают `java.lang.Exception` с понятным сообщением при
 * любой ошибке (неверный пароль/ключ, повреждённое хранилище, внутренняя
 * ошибка). Вызывающий код ОБЯЗАН оборачивать вызовы в `try`/`catch` и
 * трактовать исключение как «не удалось» — никогда не показывать частичные
 * или непроверенные данные (fail closed).
 */
object VaultBridge {
    init {
        // Имя библиотеки — `[lib] name` в src-tauri/Cargo.toml
        // (`passman_lib`). Повторный вызов loadLibrary для уже загруженной
        // библиотеки безопасен (JVM это no-op), так что неважно, успела ли
        // MainActivity Tauri-приложения загрузить её раньше нас.
        System.loadLibrary("passman_lib")
    }

    /**
     * Выводит vault key из мастер-пароля. Бросает исключение, если пароль
     * неверный или хранилище повреждено/не создано.
     *
     * [password] — вызывающий код обязан обнулить массив (`password.fill(0)`)
     * сразу после вызова; Rust-сторона не может сделать это за него после
     * возврата значения через JNI.
     */
    @JvmStatic
    external fun unlockWithPassword(appDataDir: String, password: ByteArray): ByteArray

    /**
     * [vaultKey] — ровно 32 байта (как вернул [unlockWithPassword] или был
     * расшифрован из биометрического кэша). Возвращает JSON-массив вида
     * `[{"id":"...","name":"...","link":"..."}]` совпадающих по домену
     * записей — может быть пустым, это не ошибка.
     */
    @JvmStatic
    external fun searchByDomain(appDataDir: String, vaultKey: ByteArray, domain: String): String

    /** [vaultKey] — ровно 32 байта. Бросает исключение, если запись не найдена. */
    @JvmStatic
    external fun getPassword(appDataDir: String, vaultKey: ByteArray, entryId: String): String
}
