// Bridging header — подключить в Xcode: Build Settings → Swift Compiler -
// General → Objective-C Bridging Header, указать путь к этому файлу для
// таргета расширения. Даёт Swift-коду доступ к C FFI из Rust-ядра.
#include "../PassmanFFI/passman_ffi.h"
