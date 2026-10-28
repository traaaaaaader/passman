import UIKit

/// Экран ввода мастер-пароля — фоллбэк, когда биометрия недоступна, не
/// настроена или завершилась ошибкой. UI собран программно (без storyboard)
/// для минимума зависимостей от того, что уже настроено в Xcode-проекте
/// расширения.
final class MasterPasswordViewController: UIViewController {
    private let offerEnableBiometric: Bool
    private let onUnlocked: (Data) -> Void

    private let passwordField = UITextField()
    private let errorLabel = UILabel()
    private let submitButton = UIButton(type: .system)

    init(offerEnableBiometric: Bool, onUnlocked: @escaping (Data) -> Void) {
        self.offerEnableBiometric = offerEnableBiometric
        self.onUnlocked = onUnlocked
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) не используется")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.12, green: 0.14, blue: 0.19, alpha: 1)

        let title = UILabel()
        title.text = "Введите мастер-пароль Passman"
        title.textColor = .white
        title.font = .systemFont(ofSize: 16, weight: .semibold)
        title.numberOfLines = 0

        passwordField.isSecureTextEntry = true
        passwordField.borderStyle = .roundedRect
        passwordField.backgroundColor = .white
        passwordField.autocapitalizationType = .none
        passwordField.autocorrectionType = .no

        errorLabel.textColor = UIColor(red: 0.94, green: 0.42, blue: 0.42, alpha: 1)
        errorLabel.numberOfLines = 0
        errorLabel.isHidden = true

        submitButton.setTitle("Разблокировать", for: .normal)
        submitButton.setTitleColor(.white, for: .normal)
        submitButton.backgroundColor = UIColor(red: 0.30, green: 0.49, blue: 0.94, alpha: 1)
        submitButton.layer.cornerRadius = 8
        submitButton.addTarget(self, action: #selector(submitTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, passwordField, errorLabel, submitButton])
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 40),
            submitButton.heightAnchor.constraint(equalToConstant: 44),
        ])
    }

    @objc private func submitTapped() {
        errorLabel.isHidden = true
        submitButton.isEnabled = false

        // Как и на Android: UITextField хранит текст в обычной памяти,
        // которую приложение не может принудительно обнулить — обнуляем
        // то, что можем (скопированные байты), максимально быстро после
        // использования.
        guard var passwordData = passwordField.text?.data(using: .utf8) else {
            submitButton.isEnabled = true
            return
        }
        passwordField.text = ""

        let dir = AppStorage.appDataDirectory()
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            defer { passwordData.resetBytes(in: 0..<passwordData.count) }
            do {
                let vaultKey = try VaultBridge.unlockWithPassword(appDataDir: dir, password: passwordData)
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    if self.offerEnableBiometric {
                        self.offerBiometric(vaultKey: vaultKey)
                    } else {
                        self.onUnlocked(vaultKey)
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    self?.errorLabel.text = "Неверный мастер-пароль"
                    self?.errorLabel.isHidden = false
                    self?.submitButton.isEnabled = true
                }
            }
        }
    }

    private func offerBiometric(vaultKey: Data) {
        let alert = UIAlertController(
            title: "Включить биометрию?",
            message: "Разблокировка автозаполнения отпечатком/Face ID в следующий раз",
            preferredStyle: .alert,
        )
        alert.addAction(UIAlertAction(title: "Не сейчас", style: .cancel) { [weak self] _ in
            self?.onUnlocked(vaultKey)
        })
        alert.addAction(UIAlertAction(title: "Включить", style: .default) { [weak self] _ in
            try? BiometricVaultKeyStore.save(vaultKey: vaultKey)
            self?.onUnlocked(vaultKey)
        })
        present(alert, animated: true)
    }
}
