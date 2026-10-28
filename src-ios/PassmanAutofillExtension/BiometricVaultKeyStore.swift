import Foundation
import LocalAuthentication
import Security

enum BiometricError: Error, LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let text):
            return text
        }
    }
}

/// Хранит vault key в Keychain за биометрией
/// (`kSecAttrAccessControl` с `.biometryCurrentSet`, без фоллбэка на
/// пароль/код устройства — наш собственный мастер-пароль служит фоллбэком
/// на уровне приложения, а не код блокировки устройства). В отличие от
/// Android (где за биометрией прячется ключ-обёртка в Keystore, а не сам
/// секрет), здесь biometry-gated Keychain item хранит vault key напрямую —
/// это стандартный для iOS паттерн, Keychain сам отвечает за то, чтобы
/// прочитать значение можно было только после успешной биометрии.
enum BiometricVaultKeyStore {
    private static let service = "com.trader.passman.autofill.vaultkey"
    private static let account = "vaultKey"

    static func hasCachedKey() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: false,
            kSecUseAuthenticationUI as String: kSecUseAuthenticationUISkip,
        ]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        // errSecInteractionNotAllowed означает "запись существует, но мы
        // явно запретили аутентификацию выше (kSecUseAuthenticationUISkip)"
        // — то есть кэш есть, просто мы его не читаем на этом шаге.
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    /// Перезатирает предыдущее значение, если было.
    static func save(vaultKey: Data) throws {
        clear()
        var accessError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .biometryCurrentSet,
            &accessError,
        ) else {
            throw BiometricError.message("Не удалось создать защищённое хранилище")
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: vaultKey,
            kSecAttrAccessControl as String: access,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw BiometricError.message("Не удалось сохранить ключ (код \(status))")
        }
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// Запускает системный Face ID/Touch ID и при успехе отдаёт
    /// расшифрованный vault key. Вызывает `completion` на фоновом потоке.
    static func readWithBiometrics(reason: String, completion: @escaping (Result<Data, Error>) -> Void) {
        let context = LAContext()
        context.localizedReason = reason
        var evalError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &evalError) else {
            completion(.failure(evalError ?? BiometricError.message("Биометрия недоступна")))
            return
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecUseAuthenticationContext as String: context,
        ]

        DispatchQueue.global(qos: .userInitiated).async {
            var item: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &item)
            if status == errSecSuccess, let data = item as? Data {
                completion(.success(data))
            } else {
                completion(.failure(BiometricError.message("Не удалось пройти биометрию (код \(status))")))
            }
        }
    }
}
