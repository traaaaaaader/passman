import AuthenticationServices
import UIKit

/// Точка входа расширения автозаполнения (`ASCredentialProviderExtension`).
/// Поток: биометрия (если уже закэширован vault key) → при любой ошибке —
/// мастер-пароль → поиск по домену → (если несколько совпадений) выбор
/// записи → расшифровка конкретного пароля → возврат системе.
///
/// Ничего не возвращается системе, пока один из путей аутентификации не
/// завершится успешно (fail closed) — как и на Android.
///
/// ОГРАНИЧЕНИЕ МОДЕЛИ ДАННЫХ: записи Passman не хранят отдельное поле
/// логина, поэтому `ASPasswordCredential.user` всегда пустая строка —
/// заполняется только пароль.
final class CredentialProviderViewController: ASCredentialProviderViewController {
    private var serviceIdentifiers: [ASCredentialServiceIdentifier] = []

    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        self.serviceIdentifiers = serviceIdentifiers
        startUnlockFlow()
    }

    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        // У нас всегда требуется хотя бы биометрия — просим систему
        // показать интерактивный UI вместо "тихого" пути.
        extensionContext.cancelRequest(
            withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userInteractionRequired.rawValue),
        )
    }

    override func prepareInterfaceToProvideCredential(for credentialIdentity: ASPasswordCredentialIdentity) {
        serviceIdentifiers = [credentialIdentity.serviceIdentifier]
        startUnlockFlow()
    }

    private func currentDomain() -> String {
        serviceIdentifiers.first?.identifier ?? ""
    }

    private func startUnlockFlow() {
        if BiometricVaultKeyStore.hasCachedKey() {
            BiometricVaultKeyStore.readWithBiometrics(reason: "Разблокировать Passman для автозаполнения") { [weak self] result in
                DispatchQueue.main.async {
                    switch result {
                    case .success(let vaultKey):
                        self?.proceed(vaultKey: vaultKey)
                    case .failure:
                        // Любая ошибка биометрии — переходим на
                        // мастер-пароль, как и на Android.
                        self?.showMasterPasswordScreen(offerEnableBiometric: false)
                    }
                }
            }
        } else {
            showMasterPasswordScreen(offerEnableBiometric: true)
        }
    }

    private func showMasterPasswordScreen(offerEnableBiometric: Bool) {
        let controller = MasterPasswordViewController(offerEnableBiometric: offerEnableBiometric) { [weak self] vaultKey in
            self?.proceed(vaultKey: vaultKey)
        }
        replaceContent(with: controller)
    }

    private func replaceContent(with controller: UIViewController) {
        for child in children {
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }
        addChild(controller)
        controller.view.frame = view.bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(controller.view)
        controller.didMove(toParent: self)
    }

    private func proceed(vaultKey: Data) {
        let dir = AppStorage.appDataDirectory()
        let domain = currentDomain()
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let json = try VaultBridge.searchByDomain(appDataDir: dir, vaultKey: vaultKey, domain: domain)
                let matches = try JSONDecoder().decode([EntryMatch].self, from: json)
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    if matches.isEmpty {
                        self.cancel()
                    } else if matches.count == 1 {
                        self.fill(vaultKey: vaultKey, entryId: matches[0].id, dir: dir)
                    } else {
                        self.showEntryPicker(matches: matches, vaultKey: vaultKey, dir: dir)
                    }
                }
            } catch {
                DispatchQueue.main.async { self?.cancel() }
            }
        }
    }

    private func showEntryPicker(matches: [EntryMatch], vaultKey: Data, dir: String) {
        let controller = EntryPickerViewController(matches: matches) { [weak self] entryId in
            self?.fill(vaultKey: vaultKey, entryId: entryId, dir: dir)
        }
        replaceContent(with: UINavigationController(rootViewController: controller))
    }

    private func fill(vaultKey: Data, entryId: String, dir: String) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                let password = try VaultBridge.getPassword(appDataDir: dir, vaultKey: vaultKey, entryId: entryId)
                let credential = ASPasswordCredential(user: "", password: password)
                DispatchQueue.main.async {
                    self?.extensionContext.completeRequest(withSelectedCredential: credential, completionHandler: nil)
                }
            } catch {
                DispatchQueue.main.async { self?.cancel() }
            }
        }
    }

    private func cancel() {
        extensionContext.cancelRequest(
            withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userCanceled.rawValue),
        )
    }
}
