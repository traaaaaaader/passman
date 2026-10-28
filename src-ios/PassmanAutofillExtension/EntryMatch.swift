import Foundation

/// Совпадение по домену — зеркало `BridgeEntryMatch`/`MobileEntryMatch` на
/// Rust-стороне (`src-tauri/src/bridge.rs` / `src-tauri/src/mobile_ffi.rs`).
/// Поля сериализуются в camelCase.
struct EntryMatch: Decodable {
    let id: String
    let name: String
    let link: String
}
