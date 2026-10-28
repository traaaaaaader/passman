#!/usr/bin/env ruby
# frozen_string_literal: true

# Вшивает расширение автозаполнения (src-ios/PassmanAutofillExtension) как
# НОВЫЙ ТАРГЕТ в Xcode-проект, который генерирует `tauri ios init`.
#
# ⚠️ НЕ ПРОВЕРЕНО ВЖИВУЮ — писалось без доступа к macOS/Xcode (см. общий
# контекст проекта: эта среда физически не может собрать ничего под Apple
# SDK). Это первая попытка автоматизировать то, что иначе пришлось бы
# делать руками в Xcode (File → New → Target → Credential Provider
# Extension) — на реальном Mac запустите и смотрите, что пишет скрипт; он
# сделан МАКСИМАЛЬНО словоохотливым и падает с понятным сообщением на
# каждом шаге, где ожидания о структуре проекта могут не совпасть с
# реальностью. Если споткнётся — пришлите мне точный вывод, поправим быстро.
#
# Для справки: именно так же (через xcodeproj/`xcode`-пакет и прямую правку
# .pbxproj) делает PearPass/Tetherto в своём Expo-плагине
# (withIosAutofillExtension.ts) — это не самодельный хак, а единственный
# способ создать App Extension таргет программно, Swift Package Manager
# (на котором строятся Tauri iOS-плагины) этого не умеет в принципе.
#
# Стратегия на случай неизвестной структуры проекта: вместо того чтобы
# угадывать, как именно Tauri линкует Rust-библиотеку в основной таргет
# (конкретные флаги/скрипты не задокументированы и не видны без Xcode),
# скрипт КЛОНИРУЕТ весь relevant-кусок конфигурации основного таргета
# (build settings, Run Script фазы с "cargo" в скрипте) на новый таргет —
# тогда неважно, как именно устроена сборка Rust, расширение будет собирать
# её тем же способом, что и основное приложение.
#
# Запуск (на Mac, после `tauri ios init`):
#   gem install xcodeproj   # один раз
#   ruby scripts/integrate-ios-autofill.rb

require "xcodeproj"
require "fileutils"
require "pathname"

ROOT = File.expand_path("..", __dir__)
SRC_IOS = File.join(ROOT, "src-ios")
GEN_APPLE = File.join(ROOT, "src-tauri", "gen", "apple")
EXT_NAME = "PassmanAutofillExtension"
APP_GROUP = "group.com.trader.passman"

def abort!(message)
  warn "\n❌ #{message}\n"
  exit 1
end

def info(message)
  puts "== #{message} =="
end

unless Dir.exist?(GEN_APPLE)
  abort!("#{GEN_APPLE} не найден — сначала запустите 'tauri ios init'")
end

project_paths = Dir.glob(File.join(GEN_APPLE, "*.xcodeproj"))
if project_paths.empty?
  abort!("Не нашёл .xcodeproj внутри #{GEN_APPLE} — структура проекта " \
         "отличается от ожидаемой (проверьте вручную, что сгенерировал " \
         "'tauri ios init').")
end
if project_paths.size > 1
  abort!("Нашёл несколько .xcodeproj: #{project_paths.join(', ')} — " \
         "скрипт не знает, какой из них основной, отредактируйте PROJECT_PATH вручную.")
end
project_path = project_paths.first
info "Открываю #{project_path}"
project = Xcodeproj::Project.open(project_path)

main_target = project.targets.find { |t| t.product_type == "com.apple.product-type.application" }
abort!("Не нашёл таргет с типом приложения (com.apple.product-type.application) — " \
       "список найденных таргетов: #{project.targets.map(&:name).join(', ')}") unless main_target
info "Основной таргет: #{main_target.name}"

if project.targets.any? { |t| t.name == EXT_NAME }
  info "Таргет #{EXT_NAME} уже существует — скрипт идемпотентен, выхожу без изменений"
  exit 0
end

main_debug_config = main_target.build_configurations.find { |c| c.name == "Debug" } || main_target.build_configurations.first
main_bundle_id = main_debug_config.build_settings["PRODUCT_BUNDLE_IDENTIFIER"]
abort!("Не нашёл PRODUCT_BUNDLE_IDENTIFIER на основном таргете — проверьте build settings вручную") unless main_bundle_id
ext_bundle_id = "#{main_bundle_id}.autofill"
info "Bundle ID расширения: #{ext_bundle_id}"

deployment_target = main_debug_config.build_settings["IPHONEOS_DEPLOYMENT_TARGET"]
info "Deployment target (как у основного таргета): #{deployment_target.inspect}"

# --------------------------------------------------------------------------
# 1. Создаём таргет расширения.
# --------------------------------------------------------------------------
info "Создаю таргет #{EXT_NAME}"
ext_target = project.new_target(:app_extension, EXT_NAME, :ios, deployment_target)

# --------------------------------------------------------------------------
# 2. Копируем файлы Swift/заголовки в каталог проекта и добавляем в таргет.
# --------------------------------------------------------------------------
dest_dir = File.join(GEN_APPLE, EXT_NAME)
FileUtils.mkdir_p(dest_dir)

swift_files = Dir.glob(File.join(SRC_IOS, "PassmanAutofillExtension", "*.swift"))
abort!("Не нашёл .swift файлов в #{SRC_IOS}/PassmanAutofillExtension") if swift_files.empty?

ext_group = project.main_group.new_group(EXT_NAME, dest_dir)

copied_refs = []
swift_files.each do |src|
  dest = File.join(dest_dir, File.basename(src))
  FileUtils.cp(src, dest)
  copied_refs << ext_group.new_file(dest)
end
ext_target.add_file_references(copied_refs)
info "Добавлено #{copied_refs.size} Swift-файлов"

# Заголовок FFI и bridging header — не добавляем в Sources build phase (это
# не .m/.swift), но физически нужны рядом + bridging header указывается в
# build settings.
ffi_header_src = File.join(SRC_IOS, "PassmanFFI", "passman_ffi.h")
ffi_header_dest = File.join(dest_dir, "passman_ffi.h")
FileUtils.cp(ffi_header_src, ffi_header_dest)
ext_group.new_file(ffi_header_dest)

bridging_header_src = File.join(SRC_IOS, "PassmanAutofillExtension", "#{EXT_NAME}-Bridging-Header.h")
bridging_header_dest = File.join(dest_dir, "#{EXT_NAME}-Bridging-Header.h")
FileUtils.cp(bridging_header_src, bridging_header_dest)
ext_group.new_file(bridging_header_dest)

# --------------------------------------------------------------------------
# 3. Info.plist для расширения.
# --------------------------------------------------------------------------
info_plist_path = File.join(dest_dir, "Info.plist")
File.write(info_plist_path, <<~PLIST)
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0">
  <dict>
      <key>CFBundleDevelopmentRegion</key>
      <string>ru</string>
      <key>CFBundleExecutable</key>
      <string>$(EXECUTABLE_NAME)</string>
      <key>CFBundleIdentifier</key>
      <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
      <key>CFBundleInfoDictionaryVersion</key>
      <string>6.0</string>
      <key>CFBundleName</key>
      <string>$(PRODUCT_NAME)</string>
      <key>CFBundlePackageType</key>
      <string>XPC!</string>
      <key>CFBundleShortVersionString</key>
      <string>1.0</string>
      <key>CFBundleVersion</key>
      <string>1</string>
      <key>NSExtension</key>
      <dict>
          <key>NSExtensionPointIdentifier</key>
          <string>com.apple.authentication-services-credential-provider-ui</string>
          <key>NSExtensionPrincipalClass</key>
          <string>$(PRODUCT_MODULE_NAME).CredentialProviderViewController</string>
      </dict>
  </dict>
  </plist>
PLIST
ext_group.new_file(info_plist_path)

# --------------------------------------------------------------------------
# 4. Entitlements — у расширения (App Group + keychain-access-groups), и
#    добавляем App Group основному таргету тоже (без него общий контейнер
#    не будет общим — см. src-ios/README.md).
# --------------------------------------------------------------------------
ext_entitlements_path = File.join(dest_dir, "#{EXT_NAME}.entitlements")
FileUtils.cp(File.join(SRC_IOS, "PassmanAutofillExtension", "#{EXT_NAME}.entitlements"), ext_entitlements_path)
ext_group.new_file(ext_entitlements_path)

main_entitlements_setting = main_debug_config.build_settings["CODE_SIGN_ENTITLEMENTS"]
if main_entitlements_setting.nil? || main_entitlements_setting.empty?
  info "У основного таргета нет entitlements-файла — создаю новый с App Group"
  main_entitlements_path = File.join(GEN_APPLE, main_target.name, "#{main_target.name}.entitlements")
  FileUtils.mkdir_p(File.dirname(main_entitlements_path))
  File.write(main_entitlements_path, <<~PLIST)
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
        <key>com.apple.security.application-groups</key>
        <array>
            <string>#{APP_GROUP}</string>
        </array>
    </dict>
    </plist>
  PLIST
  relative_main_ent = Pathname.new(main_entitlements_path).relative_path_from(Pathname.new(GEN_APPLE)).to_s
  main_target.build_configurations.each do |config|
    config.build_settings["CODE_SIGN_ENTITLEMENTS"] = relative_main_ent
  end
else
  warn "⚠️  У основного таргета УЖЕ есть entitlements (#{main_entitlements_setting}) — " \
       "добавьте com.apple.security.application-groups с #{APP_GROUP} туда вручную, " \
       "скрипт не трогает существующий файл, чтобы не потерять то, что там уже настроено."
end

# --------------------------------------------------------------------------
# 5. Build settings расширения — клонируем настройки основного таргета как
#    базу (включая то, что относится к линковке Rust-библиотеки, какой бы
#    она ни была устроена), затем переопределяем то, что обязано отличаться.
# --------------------------------------------------------------------------
info "Настраиваю build settings расширения (на основе настроек основного таргета)"
relative_info_plist = Pathname.new(info_plist_path).relative_path_from(Pathname.new(GEN_APPLE)).to_s
relative_bridging_header = Pathname.new(bridging_header_dest).relative_path_from(Pathname.new(GEN_APPLE)).to_s
relative_ext_entitlements = Pathname.new(ext_entitlements_path).relative_path_from(Pathname.new(GEN_APPLE)).to_s

main_target.build_configurations.each do |main_config|
  ext_config = ext_target.build_configurations.find { |c| c.name == main_config.name }
  next unless ext_config

  # Клонируем всё как базу — включая HEADER_SEARCH_PATHS/LIBRARY_SEARCH_PATHS/
  # OTHER_LDFLAGS, которые устроены Tauri-генератором каким-то конкретным
  # образом, неизвестным этому скрипту заранее.
  ext_config.build_settings = main_config.build_settings.dup

  ext_config.build_settings["PRODUCT_NAME"] = EXT_NAME
  ext_config.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] = ext_bundle_id
  ext_config.build_settings["INFOPLIST_FILE"] = relative_info_plist
  ext_config.build_settings["SWIFT_OBJC_BRIDGING_HEADER"] = relative_bridging_header
  ext_config.build_settings["CODE_SIGN_ENTITLEMENTS"] = relative_ext_entitlements
  ext_config.build_settings["SKIP_INSTALL"] = "YES"
  ext_config.build_settings["SWIFT_VERSION"] = main_config.build_settings["SWIFT_VERSION"] || "5.0"
  ext_config.build_settings["TARGETED_DEVICE_FAMILY"] = "1"
  # Главное приложение — staticlib/cdylib вшивается туда напрямую; у
  # расширения своя Sources build phase, явный APPLICATION_EXTENSION_API_ONLY
  # не включаем — ASCredentialProviderViewController сам по себе доступен
  # без него, а Rust FFI вызывается как обычная C-библиотека.
end

# --------------------------------------------------------------------------
# 6. Клонируем Run Script фазы основного таргета, упоминающие "cargo" — это
#    и есть сборка Rust-библиотеки, какой бы она ни была устроена.
# --------------------------------------------------------------------------
cargo_phases = main_target.build_phases.select do |phase|
  phase.is_a?(Xcodeproj::Project::Object::PBXShellScriptBuildPhase) &&
    phase.shell_script.to_s.include?("cargo")
end

if cargo_phases.empty?
  warn "⚠️  Не нашёл Run Script фазу со словом 'cargo' на основном таргете — " \
       "возможно, Tauri называет/устраивает сборку Rust иначе. Расширение " \
       "СОЗДАНО, но без копии этой фазы может не слинковать Rust-библиотеку. " \
       "Проверьте вручную Build Phases основного таргета в Xcode и добавьте " \
       "аналогичный Run Script на #{EXT_NAME} при необходимости."
else
  cargo_phases.each do |phase|
    info "Клонирую Run Script фазу «#{phase.name}» на #{EXT_NAME}"
    new_phase = ext_target.new_shell_script_build_phase(phase.name)
    new_phase.shell_script = phase.shell_script
    new_phase.input_paths = phase.input_paths.dup
    new_phase.output_paths = phase.output_paths.dup
    new_phase.shell_path = phase.shell_path
  end
end

# --------------------------------------------------------------------------
# 7. Встраиваем расширение в основное приложение (Embed App Extensions).
# --------------------------------------------------------------------------
info "Добавляю зависимость и встраиваю расширение в основной таргет"
main_target.add_dependency(ext_target)

embed_phase = main_target.new_copy_files_build_phase("Embed App Extensions")
embed_phase.symbol_dst_subfolder_spec = :plug_ins
build_file = embed_phase.add_file_reference(ext_target.product_reference)
build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

project.save
info "Готово — сохранено в #{project_path}"
puts <<~NEXT

  Дальше (в самом Xcode, вручную — это уже GUI-шаги, не автоматизируются):
    1. Открыть проект, Signing & Capabilities у ОБОИХ таргетов (основной + #{EXT_NAME})
       → добавить команду разработчика (Team), иначе подпись не настроится.
    2. Убедиться, что App Groups capability у обоих таргетов включает #{APP_GROUP}
       (Xcode сам предложит создать её при первом открытии, если её ещё нет
       в вашем Apple Developer аккаунте).
    3. Собрать (⌘B) — если Rust-линковка расширения не сработает "из коробки"
       (см. предупреждение выше про cargo-фазу), сообщите мне точную ошибку
       из Xcode — поправим скрипт.
NEXT
