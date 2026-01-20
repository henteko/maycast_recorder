use serde::{Deserialize, Serialize};

/// Recording metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingMetadata {
    /// Video codec (e.g., "H.264", "VP9")
    pub video_codec: String,

    /// Audio codec (e.g., "AAC", "Opus")
    pub audio_codec: String,

    /// Video width in pixels
    pub width: u32,

    /// Video height in pixels
    pub height: u32,

    /// Video bitrate in bits per second
    pub video_bitrate: u32,

    /// Audio bitrate in bits per second
    pub audio_bitrate: u32,

    /// Frame rate (frames per second)
    pub framerate: f32,

    /// Total duration in microseconds
    pub duration_us: u64,
}

impl RecordingMetadata {
    pub fn new(
        video_codec: String,
        audio_codec: String,
        width: u32,
        height: u32,
        video_bitrate: u32,
        audio_bitrate: u32,
        framerate: f32,
    ) -> Self {
        Self {
            video_codec,
            audio_codec,
            width,
            height,
            video_bitrate,
            audio_bitrate,
            framerate,
            duration_us: 0,
        }
    }
}
