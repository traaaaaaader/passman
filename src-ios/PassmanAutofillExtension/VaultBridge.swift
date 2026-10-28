import Foundation

enum VaultBridgeError: Error, LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let text):
            return text
        }
    }
}

/// Тонкая Swift-обёртка над C FFI из `src-tauri/src/mobile_ffi.rs` (секция
/// `#[cfg(target_os = "ios")]`, заголовок `PassmanFFI/passman_ffi.h`). Вся
/// логика расшифровки и поиска — в Rust; здесь только конвертация
/// Data/String в сырые буферы и освобождение памяти результата.
enum VaultBridge {
    static func unlockWithPassword(appDataDir: String, password: Data) throws -> Data {
        var passwordCopy = password
        defer {
            // Обнуляем нашу копию сразу после вызова — Rust-сторона уже
            // обнулила свою; вызывающий Swift-код обязан обнулить то, что
            // он сам держит (см. MasterPasswordViewController).
            passwordCopy.resetBytes(in: 0..<passwordCopy.count)
        }
        return try appDataDir.withCString { dirPtr in
            try passwordCopy.withUnsafeBytes { passwordBuf -> Data in
                let result = passman_mobile_unlock_with_password(
                    dirPtr,
                    passwordBuf.bindMemory(to: UInt8.self).baseAddress,
                    passwordBuf.count,
                )
                return try extractData(result)
            }
        }
    }

    static func searchByDomain(appDataDir: String, vaultKey: Data, domain: String) throws -> Data {
        try appDataDir.withCString { dirPtr in
            try domain.withCString { domainPtr in
                try vaultKey.withUnsafeBytes { keyBuf -> Data in
                    let result = passman_mobile_search_by_domain(
                        dirPtr,
                        keyBuf.bindMemory(to: UInt8.self).baseAddress,
                        keyBuf.count,
                        domainPtr,
                    )
                    return try extractData(result)
                }
            }
        }
    }

    static func getPassword(appDataDir: String, vaultKey: Data, entryId: String) throws -> String {
        let data = try appDataDir.withCString { dirPtr in
            try entryId.withCString { entryPtr in
                try vaultKey.withUnsafeBytes { keyBuf -> Data in
                    let result = passman_mobile_get_password(
                        dirPtr,
                        keyBuf.bindMemory(to: UInt8.self).baseAddress,
                        keyBuf.count,
                        entryPtr,
                    )
                    return try extractData(result)
                }
            }
        }
        guard let password = String(data: data, encoding: .utf8) else {
            throw VaultBridgeError.message("Некорректный формат пароля")
        }
        return password
    }

    private static func extractData(_ result: PassmanResult) throws -> Data {
        defer { passman_mobile_free_result(result) }
        if result.success == 1 {
            guard let ptr = result.data else { return Data() }
            return Data(bytes: ptr, count: result.data_len)
        }
        let message: String
        if let errPtr = result.error {
            message = String(cString: errPtr)
        } else {
            message = "Неизвестная ошибка"
        }
        throw VaultBridgeError.message(message)
    }
}
