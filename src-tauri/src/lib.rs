mod commands;
mod crypto;
mod domain_match;
mod mobile_ffi;
mod model;
mod rate_limiter;
mod state;
mod store;

use std::sync::Mutex;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_passman_autofill::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            app.manage(Mutex::new(AppState::new(app_data_dir)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::rate_limit_status,
            commands::setup_master_password,
            commands::unlock_vault,
            commands::lock_vault,
            commands::change_master_password,
            commands::get_settings,
            commands::update_settings,
            commands::list_sections,
            commands::create_section,
            commands::rename_section,
            commands::delete_section,
            commands::list_entries,
            commands::get_entry_password,
            commands::create_entry,
            commands::update_entry,
            commands::delete_entry,
            commands::create_pairing_code,
            commands::redeem_pairing_code,
            commands::list_paired_devices,
            commands::remove_paired_device,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
