use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global allocator.
// This is optional and can help reduce WASM binary size.
// #[cfg(feature = "wee_alloc")]
// #[global_allocator]
// static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

/// Initialize the WASM module
/// This function should be called when the WASM module is first loaded
#[wasm_bindgen(start)]
pub fn init() {
    // WASM module initialized
}

/// Simple test function to verify WASM is working
/// Returns the sum of two numbers
#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    a + b
}

/// Log a message to the browser console
#[wasm_bindgen]
pub fn log(message: &str) {
    web_sys::console::log_1(&message.into());
}

/// Get the version of the WASM module
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add() {
        assert_eq!(add(1, 2), 3);
        assert_eq!(add(-1, 1), 0);
        assert_eq!(add(0, 0), 0);
    }
}
