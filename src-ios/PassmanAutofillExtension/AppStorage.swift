import Foundation

/// Путь к данным хранилища, общий между основным приложением и этим
/// расширением.
///
/// ⚠️ НЕ ПРОВЕРЕНО/НЕ ДОВЕДЕНО ДО КОНЦА: расширения iOS выполняются в
/// отдельной песочнице — обычный `app_data_dir()` основного приложения
/// (который Tauri резолвит в приватный контейнер самого приложения) отсюда
/// НЕДОСТУПЕН. Единственный официальный способ делиться файлами — общий
/// App Group container, настроенный ОБОИМИ таргетами (основным приложением
/// и этим расширением) в Xcode → Signing & Capabilities → App Groups, с
/// одинаковым идентификатором группы и совпадающим
/// `PassmanAutofill.entitlements`.
///
/// Это требует изменения и на стороне ОСНОВНОГO приложения (куда Passman
/// пишет vault.json) — туда, в этот же контейнер, а не в собственную
/// приватную директорию. Эта часть НЕ сделана в текущую итерацию (требует
/// Xcode-проекта, которого в этой среде нет, см. src-ios/README.md) —
/// без неё расширение будет пытаться читать несуществующий/пустой файл.
enum AppStorage {
    static let appGroupIdentifier = "group.com.trader.passman"

    static func appDataDirectory() -> String {
        guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) else {
            // Контейнер не настроен — лучше вернуть временную директорию
            // (детерминированно пустую/без hранилища), чем случайно
            // прочитать что-то из чужого места.
            return NSTemporaryDirectory()
        }
        return url.path
    }
}
