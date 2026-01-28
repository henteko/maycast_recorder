use wasm_bindgen::prelude::*;

mod muxide_muxer;

pub use muxide_muxer::{MuxideConfig, MuxideMuxerState, annex_b_to_avcc, extract_sps_pps_from_avcc};

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

// ===== MuxideMuxer WASM Bindings =====

/// WASM wrapper for MuxideMuxerState
///
/// This muxer uses the muxide library for correct fMP4 generation
/// that is compatible with QuickTime and other strict players.
///
/// NOTE: Currently video-only. Audio support pending muxide library update.
#[wasm_bindgen]
pub struct MuxideMuxer {
    state: MuxideMuxerState,
}

#[wasm_bindgen]
impl MuxideMuxer {
    /// Create a new MuxideMuxer instance
    ///
    /// # Arguments
    /// * `video_width` - Video width in pixels
    /// * `video_height` - Video height in pixels
    /// * `sps` - SPS NAL unit (without start code, extracted from avcC or WebCodecs description)
    /// * `pps` - PPS NAL unit (without start code, extracted from avcC or WebCodecs description)
    #[wasm_bindgen(constructor)]
    pub fn new(video_width: u32, video_height: u32, sps: Vec<u8>, pps: Vec<u8>) -> Self {
        let config = MuxideConfig {
            video_width,
            video_height,
            video_timescale: 90000,
            fragment_duration_ms: 2000,
            sps,
            pps,
        };
        Self {
            state: MuxideMuxerState::new(config),
        }
    }

    /// Create a MuxideMuxer from avcC data (codec configuration from WebCodecs)
    ///
    /// This extracts SPS and PPS from the avcC box automatically.
    #[wasm_bindgen]
    pub fn from_avcc(video_width: u32, video_height: u32, avcc: &[u8]) -> Result<MuxideMuxer, String> {
        let (sps, pps) = extract_sps_pps_from_avcc(avcc)?;

        let config = MuxideConfig {
            video_width,
            video_height,
            video_timescale: 90000,
            fragment_duration_ms: 2000,
            sps,
            pps,
        };

        Ok(Self {
            state: MuxideMuxerState::new(config),
        })
    }

    /// Initialize the muxer and get the fMP4 initialization segment (ftyp + moov)
    #[wasm_bindgen]
    pub fn initialize(&mut self) -> Result<Vec<u8>, String> {
        self.state.init()?;
        self.state.get_init_segment()
    }

    /// Add a video chunk
    ///
    /// # Arguments
    /// * `data` - Video frame data in AVCC format (4-byte length prefixed NAL units)
    /// * `timestamp` - Presentation timestamp in microseconds (from WebCodecs)
    /// * `is_keyframe` - Whether this frame is a keyframe (sync sample)
    #[wasm_bindgen]
    pub fn push_video(
        &mut self,
        data: &[u8],
        timestamp: f64,
        is_keyframe: bool,
    ) -> Result<(), String> {
        let timestamp_us = timestamp as u64;
        self.state.push_video_chunk(data, timestamp_us, is_keyframe)
    }

    /// Add a video chunk with Annex B format data (auto-converts to AVCC)
    ///
    /// Use this when the video data uses start codes (0x00 0x00 0x00 0x01)
    /// instead of length prefixes.
    #[wasm_bindgen]
    pub fn push_video_annex_b(
        &mut self,
        data: &[u8],
        timestamp: f64,
        is_keyframe: bool,
    ) -> Result<(), String> {
        let avcc_data = annex_b_to_avcc(data);
        let timestamp_us = timestamp as u64;
        self.state.push_video_chunk(&avcc_data, timestamp_us, is_keyframe)
    }

    /// Force flush the current segment
    #[wasm_bindgen]
    pub fn flush(&mut self) -> Result<(), String> {
        self.state.force_flush()
    }

    /// Get all pending media segments
    #[wasm_bindgen]
    pub fn get_pending_segments(&mut self) -> Vec<u8> {
        let segments = self.state.get_pending_segments();
        let mut result = Vec::new();
        for segment in segments {
            result.extend(segment);
        }
        result
    }

    /// Check if there are any pending segments
    #[wasm_bindgen]
    pub fn has_pending_segments(&self) -> bool {
        self.state.has_pending_segments()
    }

    /// Get the complete fMP4 file (init segment + all media segments)
    #[wasm_bindgen]
    pub fn get_complete_file(&mut self) -> Result<Vec<u8>, String> {
        self.state.get_complete_file()
    }

    /// Get video frame count
    #[wasm_bindgen]
    pub fn get_video_frame_count(&self) -> u32 {
        self.state.video_frame_count
    }
}

// ===== Utility WASM Functions =====

/// Convert Annex B format to AVCC format
///
/// Use this to convert WebCodecs output (Annex B) to the format
/// expected by the muxer (AVCC).
#[wasm_bindgen]
pub fn convert_annex_b_to_avcc(annex_b: &[u8]) -> Vec<u8> {
    annex_b_to_avcc(annex_b)
}

/// Extract SPS and PPS from avcC data
///
/// Returns a tuple of (sps, pps) as separate arrays.
/// Use this to get the codec parameters from WebCodecs VideoEncoder description.
#[wasm_bindgen]
pub fn parse_avcc(avcc: &[u8]) -> Result<JsValue, String> {
    let (sps, pps) = extract_sps_pps_from_avcc(avcc)?;

    // Return as a JS object with sps and pps properties
    let result = js_sys::Object::new();
    let sps_array = js_sys::Uint8Array::from(&sps[..]);
    let pps_array = js_sys::Uint8Array::from(&pps[..]);

    js_sys::Reflect::set(&result, &"sps".into(), &sps_array).map_err(|e| format!("{:?}", e))?;
    js_sys::Reflect::set(&result, &"pps".into(), &pps_array).map_err(|e| format!("{:?}", e))?;

    Ok(result.into())
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
