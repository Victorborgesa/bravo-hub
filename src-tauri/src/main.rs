// Evita abrir um terminal junto com o app no Windows em modo release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bravo_hub_lib::run()
}
