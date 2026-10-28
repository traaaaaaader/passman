import UIKit

/// Список совпадающих записей, когда поиск по домену вернул больше одной —
/// пользователь выбирает нужную перед тем, как пароль будет расшифрован и
/// возвращён системе.
final class EntryPickerViewController: UITableViewController {
    private let matches: [EntryMatch]
    private let onSelected: (String) -> Void

    init(matches: [EntryMatch], onSelected: @escaping (String) -> Void) {
        self.matches = matches
        self.onSelected = onSelected
        super.init(style: .plain)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) не используется")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Выберите запись"
    }

    override func numberOfSections(in tableView: UITableView) -> Int { 1 }

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        matches.count
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = UITableViewCell(style: .default, reuseIdentifier: nil)
        cell.textLabel?.text = matches[indexPath.row].name
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        onSelected(matches[indexPath.row].id)
    }
}
