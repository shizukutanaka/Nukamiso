//! Nukamiso desktop shell.
//!
//! This crate is intentionally a thin Tauri wrapper: all application logic
//! lives in the single-file `nukamiso.html` (zero-dependency, local-first,
//! zero-telemetry). No commands are exposed to the webview, so the HTML app
//! has no bridge to native APIs beyond what the webview itself provides.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Nukamiso");
}
