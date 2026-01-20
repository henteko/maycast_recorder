use wasm_bindgen::prelude::*;

mod muxer;

pub use muxer::{MuxerConfig, MuxerState};

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

// ===== Muxer WASM Bindings =====

/// WASM wrapper for MuxerState
#[wasm_bindgen]
pub struct Muxer {
    state: MuxerState,
}

impl Default for Muxer {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl Muxer {
    /// Create a new Muxer instance
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let config = MuxerConfig::default();
        Self {
            state: MuxerState::new(config),
        }
    }

    /// Create a new Muxer with custom configuration
    #[wasm_bindgen]
    pub fn with_config(
        video_width: u32,
        video_height: u32,
        audio_sample_rate: u32,
        audio_channels: u16,
        video_config: Option<Vec<u8>>,
        audio_config: Option<Vec<u8>>,
    ) -> Self {
        let config = MuxerConfig {
            video_width,
            video_height,
            audio_sample_rate,
            audio_channels,
            video_codec_config: video_config,
            audio_codec_config: audio_config,
            ..MuxerConfig::default()
        };
        Self {
            state: MuxerState::new(config),
        }
    }

    /// Initialize the muxer and get the fMP4 initialization segment (ftyp + moov)
    #[wasm_bindgen]
    pub fn initialize(&mut self) -> Result<Vec<u8>, String> {
        self.state.init()?;
        Ok(self.state.get_fragment())
    }

    /// Add a video chunk and return the fMP4 fragment (moof + mdat)
    #[wasm_bindgen]
    pub fn push_video(&mut self, data: &[u8], timestamp: f64, is_keyframe: bool) -> Result<Vec<u8>, String> {
        // Convert microseconds (from WebCodecs) to internal timestamp
        let timestamp_us = timestamp as u64;
        self.state.push_video_chunk(data, timestamp_us, is_keyframe)?;
        Ok(self.state.get_fragment())
    }

    /// Add an audio chunk and return the fMP4 fragment (moof + mdat)
    #[wasm_bindgen]
    pub fn push_audio(&mut self, data: &[u8], timestamp: f64) -> Result<Vec<u8>, String> {
        // Convert microseconds (from WebCodecs) to internal timestamp
        let timestamp_us = timestamp as u64;
        self.state.push_audio_chunk(data, timestamp_us)?;
        Ok(self.state.get_fragment())
    }

    /// Get statistics
    #[wasm_bindgen]
    pub fn get_video_sequence_number(&self) -> u32 {
        self.state.video_sequence_number
    }

    #[wasm_bindgen]
    pub fn get_audio_sequence_number(&self) -> u32 {
        self.state.audio_sequence_number
    }
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
