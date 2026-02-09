//! Muxer implementation for correct fMP4 generation with audio support.
//!
//! This module provides a muxer that generates fragmented MP4 files compatible
//! with QuickTime and other players that have strict fMP4 requirements.
//!
//! Supports both H.264 video and AAC audio tracks.

/// Configuration for the muxer
#[derive(Debug, Clone)]
pub struct MuxideConfig {
    // Video settings
    pub video_width: u32,
    pub video_height: u32,
    pub video_timescale: u32,
    pub fragment_duration_ms: u32,
    /// SPS NAL unit (without start code, required for H.264)
    pub sps: Vec<u8>,
    /// PPS NAL unit (without start code, required for H.264)
    pub pps: Vec<u8>,

    // Audio settings (optional)
    pub audio_sample_rate: Option<u32>,
    pub audio_channels: Option<u16>,
    pub audio_timescale: Option<u32>,
    /// AudioSpecificConfig from WebCodecs (decoderConfig.description)
    pub audio_specific_config: Option<Vec<u8>>,
}

impl Default for MuxideConfig {
    fn default() -> Self {
        Self {
            video_width: 1280,
            video_height: 720,
            video_timescale: 90000, // Standard video timescale
            fragment_duration_ms: 2000,
            sps: Vec::new(),
            pps: Vec::new(),
            audio_sample_rate: None,
            audio_channels: None,
            audio_timescale: None,
            audio_specific_config: None,
        }
    }
}

/// Video sample information
#[derive(Debug, Clone)]
struct VideoSample {
    /// Presentation timestamp in timescale units
    pts: u64,
    /// Decode timestamp in timescale units
    dts: u64,
    /// Sample data (AVCC format)
    data: Vec<u8>,
    /// Whether this is a sync sample (keyframe)
    is_sync: bool,
}

/// Audio sample information
#[derive(Debug, Clone)]
struct AudioSample {
    /// Presentation timestamp in timescale units
    #[allow(dead_code)] // May be used for future per-sample audio PTS adjustments
    pts: u64,
    /// Sample data (raw AAC frame, no ADTS header)
    data: Vec<u8>,
    /// Duration in timescale units
    duration: u32,
}

/// State machine for fMP4 muxing with video and audio support
pub struct MuxideMuxerState {
    config: MuxideConfig,
    initialized: bool,
    init_segment: Vec<u8>,
    pending_segments: Vec<Vec<u8>>,
    pub video_frame_count: u32,
    pub audio_frame_count: u32,

    // Video state
    video_samples: Vec<VideoSample>,
    video_sequence_number: u32,
    video_base_media_decode_time: u64,

    // Audio state
    audio_samples: Vec<AudioSample>,
    #[allow(dead_code)] // May be used for future multi-segment audio sync
    audio_sequence_number: u32,
    audio_base_media_decode_time: u64,
}

impl MuxideMuxerState {
    /// Create a new MuxideMuxerState with the given configuration
    pub fn new(config: MuxideConfig) -> Self {
        Self {
            config,
            initialized: false,
            init_segment: Vec::new(),
            pending_segments: Vec::new(),
            video_frame_count: 0,
            audio_frame_count: 0,
            video_samples: Vec::new(),
            video_sequence_number: 1,
            video_base_media_decode_time: 0,
            audio_samples: Vec::new(),
            audio_sequence_number: 1,
            audio_base_media_decode_time: 0,
        }
    }

    /// Check if audio is enabled
    pub fn has_audio(&self) -> bool {
        self.config.audio_sample_rate.is_some() && self.config.audio_channels.is_some()
    }

    /// Initialize the muxer and generate fMP4 header (ftyp + moov)
    pub fn init(&mut self) -> Result<(), String> {
        if self.initialized {
            return Err("Muxer already initialized".to_string());
        }

        if self.config.sps.is_empty() || self.config.pps.is_empty() {
            return Err("SPS and PPS are required for initialization".to_string());
        }

        // Build init segment with video and optionally audio
        self.init_segment = build_init_segment(&self.config);
        self.initialized = true;

        Ok(())
    }

    /// Get the initialization segment (ftyp + moov)
    pub fn get_init_segment(&self) -> Result<Vec<u8>, String> {
        if !self.initialized {
            return Err("Muxer not initialized".to_string());
        }
        Ok(self.init_segment.clone())
    }

    /// Add a video chunk and generate moof + mdat fragment
    ///
    /// # Arguments
    /// * `data` - Video frame data in AVCC format (4-byte length prefixed NAL units)
    /// * `timestamp` - Presentation timestamp in microseconds
    /// * `is_keyframe` - Whether this frame is a keyframe (sync sample)
    pub fn push_video_chunk(
        &mut self,
        data: &[u8],
        timestamp: u64,
        is_keyframe: bool,
    ) -> Result<(), String> {
        if !self.initialized {
            return Err("Muxer not initialized".to_string());
        }

        // Convert timestamp from microseconds to timescale units
        let pts = (timestamp * self.config.video_timescale as u64) / 1_000_000;
        let dts = pts; // No B-frames, so PTS == DTS

        self.video_samples.push(VideoSample {
            pts,
            dts,
            data: data.to_vec(),
            is_sync: is_keyframe,
        });
        self.video_frame_count += 1;

        // Check if we have enough samples to flush
        self.check_and_flush_segments();

        Ok(())
    }

    /// Add an audio chunk
    ///
    /// # Arguments
    /// * `data` - Audio frame data (raw AAC, no ADTS header)
    /// * `timestamp` - Presentation timestamp in microseconds
    /// * `duration` - Duration in microseconds
    pub fn push_audio_chunk(
        &mut self,
        data: &[u8],
        timestamp: u64,
        duration: u32,
    ) -> Result<(), String> {
        if !self.initialized {
            return Err("Muxer not initialized".to_string());
        }

        if !self.has_audio() {
            return Err("Audio not configured".to_string());
        }

        let audio_timescale = self
            .config
            .audio_timescale
            .unwrap_or(self.config.audio_sample_rate.unwrap_or(48000));

        // Convert timestamp from microseconds to timescale units
        let pts = (timestamp * audio_timescale as u64) / 1_000_000;
        // Use rounding instead of truncation to avoid cumulative drift.
        // e.g. 21333µs * 48000 / 1_000_000 = 1023.984 → truncated to 1023, but should be 1024.
        // Over 20000+ frames, 1-tick loss per frame accumulates to ~0.3s of A/V desync.
        let duration_ts = ((duration as u64 * audio_timescale as u64 + 500_000) / 1_000_000) as u32;

        self.audio_samples.push(AudioSample {
            pts,
            data: data.to_vec(),
            duration: duration_ts,
        });
        self.audio_frame_count += 1;

        Ok(())
    }

    /// Check if we should flush segments based on video duration
    fn check_and_flush_segments(&mut self) {
        if self.video_samples.len() < 2 {
            return;
        }

        let first_dts = self.video_samples[0].dts;
        let last_dts = self.video_samples.last().unwrap().dts;
        let duration_ticks = last_dts - first_dts;
        let duration_ms = duration_ticks * 1000 / self.config.video_timescale as u64;

        if duration_ms >= self.config.fragment_duration_ms as u64 {
            self.flush_segments();
        }
    }

    /// Calculate total video duration matching trun box logic exactly.
    /// This ensures segment[N].tfdt + sum(trun_durations) == segment[N+1].tfdt.
    fn calculate_video_trun_total_duration(samples: &[VideoSample]) -> u64 {
        if samples.is_empty() {
            return 0;
        }
        let mut total: u64 = 0;
        for i in 0..samples.len() {
            let duration = if i + 1 < samples.len() {
                (samples[i + 1].dts - samples[i].dts) as u32
            } else if i > 0 {
                (samples[i].dts - samples[i - 1].dts) as u32
            } else {
                3000 // Default: 1 frame at 30fps
            };
            total += duration as u64;
        }
        total
    }

    /// Calculate total audio duration from sample durations.
    fn calculate_audio_trun_total_duration(samples: &[AudioSample]) -> u64 {
        samples.iter().map(|s| s.duration as u64).sum()
    }

    /// Flush all pending samples into a media segment
    fn flush_segments(&mut self) {
        if self.video_samples.is_empty() {
            return;
        }

        let segment = build_media_segment_av(
            &self.video_samples,
            &self.audio_samples,
            self.video_sequence_number,
            self.video_base_media_decode_time,
            self.audio_base_media_decode_time,
            &self.config,
        );

        // Update state for next segment using cumulative duration.
        // This guarantees: segment[N].tfdt + sum(segment[N].trun_durations) == segment[N+1].tfdt
        // No rounding error accumulates across segments.
        self.video_sequence_number += 1;
        let video_total_duration = Self::calculate_video_trun_total_duration(&self.video_samples);
        self.video_base_media_decode_time += video_total_duration;

        let audio_total_duration = Self::calculate_audio_trun_total_duration(&self.audio_samples);
        self.audio_base_media_decode_time += audio_total_duration;

        self.video_samples.clear();
        self.audio_samples.clear();
        self.pending_segments.push(segment);
    }

    /// Force flush the current segment even if it hasn't reached the target duration
    pub fn force_flush(&mut self) -> Result<(), String> {
        if !self.initialized {
            return Err("Muxer not initialized".to_string());
        }

        self.flush_segments();

        Ok(())
    }

    /// Get all pending media segments and clear them
    pub fn get_pending_segments(&mut self) -> Vec<Vec<u8>> {
        std::mem::take(&mut self.pending_segments)
    }

    /// Check if there are any pending segments
    pub fn has_pending_segments(&self) -> bool {
        !self.pending_segments.is_empty()
    }

    /// Get the complete fMP4 file (init segment + all media segments)
    pub fn get_complete_file(&mut self) -> Result<Vec<u8>, String> {
        if !self.initialized {
            return Err("Muxer not initialized".to_string());
        }

        // Force flush any remaining data
        self.force_flush()?;

        let mut result = self.init_segment.clone();
        for segment in &self.pending_segments {
            result.extend(segment);
        }
        self.pending_segments.clear();

        Ok(result)
    }
}

/// Extract SPS and PPS from avcC box (codec configuration from WebCodecs)
///
/// The avcC box format:
/// - 1 byte: configurationVersion (always 1)
/// - 1 byte: AVCProfileIndication
/// - 1 byte: profile_compatibility
/// - 1 byte: AVCLevelIndication
/// - 1 byte: lengthSizeMinusOne (typically 3, meaning 4-byte NAL length)
/// - 1 byte: numOfSequenceParameterSets (upper 3 bits reserved, lower 5 bits count)
/// - 2 bytes: sequenceParameterSetLength
/// - N bytes: sequenceParameterSetNALUnit
/// - 1 byte: numOfPictureParameterSets
/// - 2 bytes: pictureParameterSetLength
/// - N bytes: pictureParameterSetNALUnit
pub fn extract_sps_pps_from_avcc(avcc: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    if avcc.len() < 7 {
        return Err("avcC too short".to_string());
    }

    // configurationVersion should be 1
    if avcc[0] != 1 {
        return Err(format!("Invalid avcC version: {}", avcc[0]));
    }

    let mut offset = 5; // Skip to numOfSequenceParameterSets

    // Number of SPS (lower 5 bits)
    let num_sps = avcc[offset] & 0x1F;
    offset += 1;

    if num_sps == 0 {
        return Err("No SPS found in avcC".to_string());
    }

    // Read first SPS
    if offset + 2 > avcc.len() {
        return Err("avcC truncated at SPS length".to_string());
    }
    let sps_length = u16::from_be_bytes([avcc[offset], avcc[offset + 1]]) as usize;
    offset += 2;

    if offset + sps_length > avcc.len() {
        return Err("avcC truncated at SPS data".to_string());
    }
    let sps = avcc[offset..offset + sps_length].to_vec();
    offset += sps_length;

    // Skip remaining SPS if any
    for _ in 1..num_sps {
        if offset + 2 > avcc.len() {
            return Err("avcC truncated at additional SPS".to_string());
        }
        let len = u16::from_be_bytes([avcc[offset], avcc[offset + 1]]) as usize;
        offset += 2 + len;
    }

    // Number of PPS
    if offset >= avcc.len() {
        return Err("avcC truncated at PPS count".to_string());
    }
    let num_pps = avcc[offset];
    offset += 1;

    if num_pps == 0 {
        return Err("No PPS found in avcC".to_string());
    }

    // Read first PPS
    if offset + 2 > avcc.len() {
        return Err("avcC truncated at PPS length".to_string());
    }
    let pps_length = u16::from_be_bytes([avcc[offset], avcc[offset + 1]]) as usize;
    offset += 2;

    if offset + pps_length > avcc.len() {
        return Err("avcC truncated at PPS data".to_string());
    }
    let pps = avcc[offset..offset + pps_length].to_vec();

    Ok((sps, pps))
}

/// Convert Annex B format (start code prefixed) to AVCC format (length prefixed)
///
/// Annex B uses start codes (0x00 0x00 0x00 0x01 or 0x00 0x00 0x01) to delimit NAL units.
/// AVCC uses 4-byte big-endian length prefixes instead.
pub fn annex_b_to_avcc(annex_b: &[u8]) -> Vec<u8> {
    let mut result = Vec::new();
    let mut i = 0;

    while i < annex_b.len() {
        // Find start code
        let start_code_len = if i + 4 <= annex_b.len()
            && annex_b[i] == 0x00
            && annex_b[i + 1] == 0x00
            && annex_b[i + 2] == 0x00
            && annex_b[i + 3] == 0x01
        {
            4
        } else if i + 3 <= annex_b.len()
            && annex_b[i] == 0x00
            && annex_b[i + 1] == 0x00
            && annex_b[i + 2] == 0x01
        {
            3
        } else {
            i += 1;
            continue;
        };

        let nal_start = i + start_code_len;

        // Find next start code or end of data
        let mut nal_end = annex_b.len();
        for j in nal_start..annex_b.len() {
            if j + 4 <= annex_b.len()
                && annex_b[j] == 0x00
                && annex_b[j + 1] == 0x00
                && annex_b[j + 2] == 0x00
                && annex_b[j + 3] == 0x01
            {
                nal_end = j;
                break;
            }
            if j + 3 <= annex_b.len()
                && annex_b[j] == 0x00
                && annex_b[j + 1] == 0x00
                && annex_b[j + 2] == 0x01
            {
                nal_end = j;
                break;
            }
        }

        // Remove trailing zeros before next start code
        while nal_end > nal_start && annex_b[nal_end - 1] == 0x00 {
            nal_end -= 1;
        }

        if nal_end > nal_start {
            let nal_data = &annex_b[nal_start..nal_end];
            let nal_len = nal_data.len() as u32;

            // Write 4-byte length prefix + NAL data
            result.extend_from_slice(&nal_len.to_be_bytes());
            result.extend_from_slice(nal_data);
        }

        i = nal_end;
    }

    result
}

// ============================================================================
// MP4 Box Building Functions
// ============================================================================

/// Build a generic MP4 box with type and payload
fn build_box(typ: &[u8; 4], payload: &[u8]) -> Vec<u8> {
    let size = (8 + payload.len()) as u32;
    let mut buf = Vec::with_capacity(size as usize);
    buf.extend_from_slice(&size.to_be_bytes());
    buf.extend_from_slice(typ);
    buf.extend_from_slice(payload);
    buf
}

/// Build the complete init segment (ftyp + moov)
fn build_init_segment(config: &MuxideConfig) -> Vec<u8> {
    let mut buf = Vec::new();

    // ftyp box
    let ftyp = build_ftyp();
    buf.extend_from_slice(&ftyp);

    // moov box
    let moov = build_moov(config);
    buf.extend_from_slice(&moov);

    buf
}

/// Build ftyp box for fMP4
fn build_ftyp() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(b"iso5"); // Major brand
    payload.extend_from_slice(&0u32.to_be_bytes()); // Minor version
    payload.extend_from_slice(b"iso5"); // Compatible brands
    payload.extend_from_slice(b"iso6");
    payload.extend_from_slice(b"mp41");
    build_box(b"ftyp", &payload)
}

/// Build moov box with video and optionally audio tracks
fn build_moov(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();

    let has_audio = config.audio_sample_rate.is_some() && config.audio_channels.is_some();
    let next_track_id = if has_audio { 3 } else { 2 };

    // mvhd (movie header)
    let mvhd = build_mvhd(config.video_timescale, next_track_id);
    payload.extend_from_slice(&mvhd);

    // mvex (movie extends) - required for fMP4
    let mvex = build_mvex(has_audio);
    payload.extend_from_slice(&mvex);

    // Video trak (track_id = 1)
    let video_trak = build_video_trak(config);
    payload.extend_from_slice(&video_trak);

    // Audio trak (track_id = 2) if configured
    if has_audio {
        let audio_trak = build_audio_trak(config);
        payload.extend_from_slice(&audio_trak);
    }

    build_box(b"moov", &payload)
}

/// Build mvhd (movie header) box
fn build_mvhd(timescale: u32, next_track_id: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&0u32.to_be_bytes()); // Creation time
    payload.extend_from_slice(&0u32.to_be_bytes()); // Modification time
    payload.extend_from_slice(&timescale.to_be_bytes()); // Timescale
    payload.extend_from_slice(&0u32.to_be_bytes()); // Duration (unknown for live)
    payload.extend_from_slice(&0x0001_0000_u32.to_be_bytes()); // Rate (1.0)
    payload.extend_from_slice(&0x0100_u16.to_be_bytes()); // Volume (1.0)
    payload.extend_from_slice(&[0u8; 10]); // Reserved
                                           // Unity matrix (36 bytes)
    payload.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 12]);
    payload.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 12]);
    payload.extend_from_slice(&0x4000_0000_u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 24]); // Pre-defined
    payload.extend_from_slice(&next_track_id.to_be_bytes()); // Next track ID
    build_box(b"mvhd", &payload)
}

/// Build mvex (movie extends) box with trex for each track
fn build_mvex(has_audio: bool) -> Vec<u8> {
    let mut payload = Vec::new();

    // Video trex (track_id = 1)
    let video_trex = build_trex(1);
    payload.extend_from_slice(&video_trex);

    // Audio trex (track_id = 2) if configured
    if has_audio {
        let audio_trex = build_trex(2);
        payload.extend_from_slice(&audio_trex);
    }

    build_box(b"mvex", &payload)
}

/// Build trex (track extends) box
fn build_trex(track_id: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&track_id.to_be_bytes()); // Track ID
    payload.extend_from_slice(&1u32.to_be_bytes()); // Default sample description index
    payload.extend_from_slice(&0u32.to_be_bytes()); // Default sample duration
    payload.extend_from_slice(&0u32.to_be_bytes()); // Default sample size
    payload.extend_from_slice(&0u32.to_be_bytes()); // Default sample flags
    build_box(b"trex", &payload)
}

/// Build video trak box
fn build_video_trak(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();

    // tkhd (track header)
    let tkhd = build_video_tkhd(config);
    payload.extend_from_slice(&tkhd);

    // mdia (media)
    let mdia = build_video_mdia(config);
    payload.extend_from_slice(&mdia);

    build_box(b"trak", &payload)
}

/// Build video tkhd (track header) box
fn build_video_tkhd(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0x0000_0003_u32.to_be_bytes()); // Version 0, flags: enabled + in_movie
    payload.extend_from_slice(&0u32.to_be_bytes()); // Creation time
    payload.extend_from_slice(&0u32.to_be_bytes()); // Modification time
    payload.extend_from_slice(&1u32.to_be_bytes()); // Track ID = 1 (video)
    payload.extend_from_slice(&0u32.to_be_bytes()); // Reserved
    payload.extend_from_slice(&0u32.to_be_bytes()); // Duration
    payload.extend_from_slice(&[0u8; 8]); // Reserved
    payload.extend_from_slice(&0u16.to_be_bytes()); // Layer
    payload.extend_from_slice(&0u16.to_be_bytes()); // Alternate group
    payload.extend_from_slice(&0u16.to_be_bytes()); // Volume (0 for video)
    payload.extend_from_slice(&0u16.to_be_bytes()); // Reserved
                                                    // Unity matrix (36 bytes)
    payload.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 12]);
    payload.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 12]);
    payload.extend_from_slice(&0x4000_0000_u32.to_be_bytes());
    // Width and height in 16.16 fixed-point
    payload.extend_from_slice(&((config.video_width) << 16).to_be_bytes());
    payload.extend_from_slice(&((config.video_height) << 16).to_be_bytes());
    build_box(b"tkhd", &payload)
}

/// Build video mdia (media) box
fn build_video_mdia(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();

    // mdhd (media header)
    let mdhd = build_mdhd(config.video_timescale);
    payload.extend_from_slice(&mdhd);

    // hdlr (handler) - video
    let hdlr = build_hdlr(b"vide", b"VideoHandler\0");
    payload.extend_from_slice(&hdlr);

    // minf (media info)
    let minf = build_video_minf(config);
    payload.extend_from_slice(&minf);

    build_box(b"mdia", &payload)
}

/// Build mdhd (media header) box
fn build_mdhd(timescale: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&0u32.to_be_bytes()); // Creation time
    payload.extend_from_slice(&0u32.to_be_bytes()); // Modification time
    payload.extend_from_slice(&timescale.to_be_bytes()); // Timescale
    payload.extend_from_slice(&0u32.to_be_bytes()); // Duration (unknown)
                                                    // Language: "und" (undetermined) encoded as packed ISO 639-2/T
    let lang = encode_language_code("und");
    payload.extend_from_slice(&lang);
    payload.extend_from_slice(&0u16.to_be_bytes()); // Quality
    build_box(b"mdhd", &payload)
}

/// Encode ISO 639-2/T language code
fn encode_language_code(language: &str) -> [u8; 2] {
    let chars: Vec<char> = language.chars().take(3).collect();
    let c1 = chars.first().copied().unwrap_or('u') as u16;
    let c2 = chars.get(1).copied().unwrap_or('n') as u16;
    let c3 = chars.get(2).copied().unwrap_or('d') as u16;

    let packed = ((c1.saturating_sub(0x60) & 0x1F) << 10)
        | ((c2.saturating_sub(0x60) & 0x1F) << 5)
        | (c3.saturating_sub(0x60) & 0x1F);

    packed.to_be_bytes()
}

/// Build hdlr (handler) box
fn build_hdlr(handler_type: &[u8; 4], name: &[u8]) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&0u32.to_be_bytes()); // Pre-defined
    payload.extend_from_slice(handler_type); // Handler type
    payload.extend_from_slice(&[0u8; 12]); // Reserved
    payload.extend_from_slice(name); // Name (null-terminated)
    build_box(b"hdlr", &payload)
}

/// Build video minf (media info) box
fn build_video_minf(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();

    // vmhd (video media header)
    let vmhd = build_vmhd();
    payload.extend_from_slice(&vmhd);

    // dinf (data information)
    let dinf = build_dinf();
    payload.extend_from_slice(&dinf);

    // stbl (sample table)
    let stbl = build_video_stbl(config);
    payload.extend_from_slice(&stbl);

    build_box(b"minf", &payload)
}

/// Build vmhd (video media header) box
fn build_vmhd() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0x0000_0001_u32.to_be_bytes()); // Version 0, flags: 1
    payload.extend_from_slice(&[0u8; 8]); // Graphics mode + op color
    build_box(b"vmhd", &payload)
}

/// Build dinf (data information) box
fn build_dinf() -> Vec<u8> {
    // dref with self-contained data reference
    let mut dref_payload = Vec::new();
    dref_payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    dref_payload.extend_from_slice(&1u32.to_be_bytes()); // Entry count
                                                         // url box (self-contained)
    let url_payload = [0x00, 0x00, 0x00, 0x01]; // Flags: self-contained
    let url_box = build_box(b"url ", &url_payload);
    dref_payload.extend_from_slice(&url_box);
    let dref = build_box(b"dref", &dref_payload);

    build_box(b"dinf", &dref)
}

/// Build video stbl (sample table) box
fn build_video_stbl(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();

    // stsd (sample description)
    let stsd = build_video_stsd(config);
    payload.extend_from_slice(&stsd);

    // Empty stts, stsc, stsz, stco (data in moof for fMP4)
    payload.extend_from_slice(&build_empty_stts());
    payload.extend_from_slice(&build_empty_stsc());
    payload.extend_from_slice(&build_empty_stsz());
    payload.extend_from_slice(&build_empty_stco());

    build_box(b"stbl", &payload)
}

/// Build video stsd (sample description) box
fn build_video_stsd(config: &MuxideConfig) -> Vec<u8> {
    let avc1 = build_avc1(config);

    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&1u32.to_be_bytes()); // Entry count
    payload.extend_from_slice(&avc1);
    build_box(b"stsd", &payload)
}

/// Build avc1 (H.264 sample entry) box
fn build_avc1(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&[0u8; 6]); // Reserved
    payload.extend_from_slice(&1u16.to_be_bytes()); // Data reference index
    payload.extend_from_slice(&0u16.to_be_bytes()); // Pre-defined
    payload.extend_from_slice(&0u16.to_be_bytes()); // Reserved
    payload.extend_from_slice(&[0u8; 12]); // Pre-defined
    payload.extend_from_slice(&(config.video_width as u16).to_be_bytes());
    payload.extend_from_slice(&(config.video_height as u16).to_be_bytes());
    payload.extend_from_slice(&0x0048_0000_u32.to_be_bytes()); // Horizontal resolution (72 dpi)
    payload.extend_from_slice(&0x0048_0000_u32.to_be_bytes()); // Vertical resolution (72 dpi)
    payload.extend_from_slice(&0u32.to_be_bytes()); // Reserved
    payload.extend_from_slice(&1u16.to_be_bytes()); // Frame count
    payload.extend_from_slice(&[0u8; 32]); // Compressor name
    payload.extend_from_slice(&0x0018_u16.to_be_bytes()); // Depth: 24-bit color
    payload.extend_from_slice(&0xffff_u16.to_be_bytes()); // Pre-defined (-1)

    // avcC (AVC Configuration)
    let avcc = build_avcc(config);
    payload.extend_from_slice(&avcc);

    build_box(b"avc1", &payload)
}

/// Build avcC (AVC Configuration) box
fn build_avcc(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = vec![
        1,                                          // Configuration version
        config.sps.get(1).copied().unwrap_or(0x42), // Profile
        config.sps.get(2).copied().unwrap_or(0x00), // Profile compatibility
        config.sps.get(3).copied().unwrap_or(0x1e), // Level
        0xff, // 6 bits reserved + 2 bits NAL unit length - 1 (3 = 4 bytes)
        0xe1, // 3 bits reserved + 5 bits number of SPS
    ];
    payload.extend_from_slice(&(config.sps.len() as u16).to_be_bytes());
    payload.extend_from_slice(&config.sps);
    payload.push(1); // Number of PPS
    payload.extend_from_slice(&(config.pps.len() as u16).to_be_bytes());
    payload.extend_from_slice(&config.pps);
    build_box(b"avcC", &payload)
}

/// Build empty stts box
fn build_empty_stts() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&0u32.to_be_bytes()); // Entry count
    build_box(b"stts", &payload)
}

/// Build empty stsc box
fn build_empty_stsc() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&0u32.to_be_bytes()); // Entry count
    build_box(b"stsc", &payload)
}

/// Build empty stsz box
fn build_empty_stsz() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&0u32.to_be_bytes()); // Sample size (0 = variable)
    payload.extend_from_slice(&0u32.to_be_bytes()); // Sample count
    build_box(b"stsz", &payload)
}

/// Build empty stco box
fn build_empty_stco() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&0u32.to_be_bytes()); // Entry count
    build_box(b"stco", &payload)
}

// ============================================================================
// Audio Track Building Functions
// ============================================================================

/// Build audio trak box
fn build_audio_trak(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();

    // tkhd (track header)
    let tkhd = build_audio_tkhd();
    payload.extend_from_slice(&tkhd);

    // mdia (media)
    let mdia = build_audio_mdia(config);
    payload.extend_from_slice(&mdia);

    build_box(b"trak", &payload)
}

/// Build audio tkhd (track header) box
fn build_audio_tkhd() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0x0000_0003_u32.to_be_bytes()); // Version 0, flags: enabled + in_movie
    payload.extend_from_slice(&0u32.to_be_bytes()); // Creation time
    payload.extend_from_slice(&0u32.to_be_bytes()); // Modification time
    payload.extend_from_slice(&2u32.to_be_bytes()); // Track ID = 2 (audio)
    payload.extend_from_slice(&0u32.to_be_bytes()); // Reserved
    payload.extend_from_slice(&0u32.to_be_bytes()); // Duration
    payload.extend_from_slice(&[0u8; 8]); // Reserved
    payload.extend_from_slice(&0u16.to_be_bytes()); // Layer
    payload.extend_from_slice(&0u16.to_be_bytes()); // Alternate group
    payload.extend_from_slice(&0x0100_u16.to_be_bytes()); // Volume (1.0 for audio)
    payload.extend_from_slice(&0u16.to_be_bytes()); // Reserved
                                                    // Unity matrix (36 bytes)
    payload.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 12]);
    payload.extend_from_slice(&0x0001_0000_u32.to_be_bytes());
    payload.extend_from_slice(&[0u8; 12]);
    payload.extend_from_slice(&0x4000_0000_u32.to_be_bytes());
    // Width and height (0 for audio)
    payload.extend_from_slice(&0u32.to_be_bytes());
    payload.extend_from_slice(&0u32.to_be_bytes());
    build_box(b"tkhd", &payload)
}

/// Build audio mdia (media) box
fn build_audio_mdia(config: &MuxideConfig) -> Vec<u8> {
    let audio_timescale = config
        .audio_timescale
        .unwrap_or(config.audio_sample_rate.unwrap_or(48000));

    let mut payload = Vec::new();

    // mdhd (media header)
    let mdhd = build_mdhd(audio_timescale);
    payload.extend_from_slice(&mdhd);

    // hdlr (handler) - sound
    let hdlr = build_hdlr(b"soun", b"SoundHandler\0");
    payload.extend_from_slice(&hdlr);

    // minf (media info)
    let minf = build_audio_minf(config);
    payload.extend_from_slice(&minf);

    build_box(b"mdia", &payload)
}

/// Build audio minf (media info) box
fn build_audio_minf(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();

    // smhd (sound media header)
    let smhd = build_smhd();
    payload.extend_from_slice(&smhd);

    // dinf (data information)
    let dinf = build_dinf();
    payload.extend_from_slice(&dinf);

    // stbl (sample table)
    let stbl = build_audio_stbl(config);
    payload.extend_from_slice(&stbl);

    build_box(b"minf", &payload)
}

/// Build smhd (sound media header) box
fn build_smhd() -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&0u16.to_be_bytes()); // Balance
    payload.extend_from_slice(&0u16.to_be_bytes()); // Reserved
    build_box(b"smhd", &payload)
}

/// Build audio stbl (sample table) box
fn build_audio_stbl(config: &MuxideConfig) -> Vec<u8> {
    let mut payload = Vec::new();

    // stsd (sample description)
    let stsd = build_audio_stsd(config);
    payload.extend_from_slice(&stsd);

    // Empty stts, stsc, stsz, stco (data in moof for fMP4)
    payload.extend_from_slice(&build_empty_stts());
    payload.extend_from_slice(&build_empty_stsc());
    payload.extend_from_slice(&build_empty_stsz());
    payload.extend_from_slice(&build_empty_stco());

    build_box(b"stbl", &payload)
}

/// Build audio stsd (sample description) box
fn build_audio_stsd(config: &MuxideConfig) -> Vec<u8> {
    let mp4a = build_mp4a(config);

    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&1u32.to_be_bytes()); // Entry count
    payload.extend_from_slice(&mp4a);
    build_box(b"stsd", &payload)
}

/// Build mp4a (AAC sample entry) box
fn build_mp4a(config: &MuxideConfig) -> Vec<u8> {
    let sample_rate = config.audio_sample_rate.unwrap_or(48000);
    let channels = config.audio_channels.unwrap_or(2);

    let mut payload = Vec::new();
    payload.extend_from_slice(&[0u8; 6]); // Reserved
    payload.extend_from_slice(&1u16.to_be_bytes()); // Data reference index
    payload.extend_from_slice(&0u16.to_be_bytes()); // Version
    payload.extend_from_slice(&0u16.to_be_bytes()); // Revision level
    payload.extend_from_slice(&0u32.to_be_bytes()); // Vendor
    payload.extend_from_slice(&channels.to_be_bytes()); // Channel count
    payload.extend_from_slice(&16u16.to_be_bytes()); // Sample size (16 bits)
    payload.extend_from_slice(&0u16.to_be_bytes()); // Compression ID
    payload.extend_from_slice(&0u16.to_be_bytes()); // Packet size
                                                    // Sample rate in 16.16 fixed-point format
    payload.extend_from_slice(&(sample_rate << 16).to_be_bytes());

    // esds (Elementary Stream Descriptor) box
    let esds = build_esds(config);
    payload.extend_from_slice(&esds);

    build_box(b"mp4a", &payload)
}

/// Build esds (Elementary Stream Descriptor) box
fn build_esds(config: &MuxideConfig) -> Vec<u8> {
    let sample_rate = config.audio_sample_rate.unwrap_or(48000);
    let channels = config.audio_channels.unwrap_or(2);

    // Build or use provided AudioSpecificConfig
    let audio_specific_config = config
        .audio_specific_config
        .clone()
        .unwrap_or_else(|| build_audio_specific_config(sample_rate, channels));

    // ES Descriptor
    let mut es_descriptor = Vec::new();

    // ES_ID
    es_descriptor.extend_from_slice(&0u16.to_be_bytes());
    // Flags (streamDependenceFlag, URL_Flag, OCRstreamFlag, streamPriority)
    es_descriptor.push(0);

    // DecoderConfigDescriptor
    let mut decoder_config = Vec::new();
    decoder_config.push(0x40); // objectTypeIndication: Audio ISO/IEC 14496-3 (AAC)
                               // streamType (6 bits) = 0x05 (AudioStream), upStream (1 bit) = 0, reserved (1 bit) = 1
    decoder_config.push((0x05 << 2) | 0x01);
    // bufferSizeDB (24 bits)
    decoder_config.extend_from_slice(&[0x00, 0x00, 0x00]);
    // maxBitrate (128 kbps)
    decoder_config.extend_from_slice(&128000u32.to_be_bytes());
    // avgBitrate (128 kbps)
    decoder_config.extend_from_slice(&128000u32.to_be_bytes());

    // DecoderSpecificInfo (AudioSpecificConfig)
    let dsi = build_descriptor(0x05, &audio_specific_config);
    decoder_config.extend_from_slice(&dsi);

    let decoder_config_descriptor = build_descriptor(0x04, &decoder_config);
    es_descriptor.extend_from_slice(&decoder_config_descriptor);

    // SLConfigDescriptor (predefined = 2 for MP4)
    let sl_config = build_descriptor(0x06, &[0x02]);
    es_descriptor.extend_from_slice(&sl_config);

    let es_descriptor_full = build_descriptor(0x03, &es_descriptor);

    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&es_descriptor_full);

    build_box(b"esds", &payload)
}

/// Build ISO 14496 descriptor with tag and length
fn build_descriptor(tag: u8, data: &[u8]) -> Vec<u8> {
    let mut result = vec![tag];
    // Length encoding (up to 4 bytes, 7 bits each)
    let len = data.len();
    if len < 128 {
        result.push(len as u8);
    } else {
        // Multi-byte length encoding
        result.push(0x80 | ((len >> 21) & 0x7F) as u8);
        result.push(0x80 | ((len >> 14) & 0x7F) as u8);
        result.push(0x80 | ((len >> 7) & 0x7F) as u8);
        result.push((len & 0x7F) as u8);
    }
    result.extend_from_slice(data);
    result
}

/// Build AudioSpecificConfig for AAC-LC
fn build_audio_specific_config(sample_rate: u32, channels: u16) -> Vec<u8> {
    // AudioSpecificConfig structure (ISO 14496-3):
    // - audioObjectType (5 bits): 2 = AAC-LC
    // - samplingFrequencyIndex (4 bits): index into frequency table
    // - channelConfiguration (4 bits): channel count

    let sample_rate_index = match sample_rate {
        96000 => 0,
        88200 => 1,
        64000 => 2,
        48000 => 3,
        44100 => 4,
        32000 => 5,
        24000 => 6,
        22050 => 7,
        16000 => 8,
        12000 => 9,
        11025 => 10,
        8000 => 11,
        7350 => 12,
        _ => 3, // Default to 48000 Hz
    };

    let channel_config = channels.min(7) as u8; // Max 7 for standard configs

    // Pack into 2 bytes:
    // Byte 0: [audioObjectType (5 bits)][samplingFrequencyIndex high 3 bits]
    // Byte 1: [samplingFrequencyIndex low 1 bit][channelConfiguration (4 bits)][frame_length_flag (1 bit)][dependsOnCoreCoder (1 bit)][extensionFlag (1 bit)]
    let byte0 = (2 << 3) | (sample_rate_index >> 1);
    let byte1 = ((sample_rate_index & 1) << 7) | (channel_config << 3);

    vec![byte0, byte1]
}

// ============================================================================
// Media Segment Building Functions (moof + mdat)
// ============================================================================

/// Build media segment with video and audio
fn build_media_segment_av(
    video_samples: &[VideoSample],
    audio_samples: &[AudioSample],
    sequence_number: u32,
    video_base_decode_time: u64,
    audio_base_decode_time: u64,
    config: &MuxideConfig,
) -> Vec<u8> {
    let has_audio = config.audio_sample_rate.is_some()
        && config.audio_channels.is_some()
        && !audio_samples.is_empty();

    // Calculate total mdat size
    let video_data_size: usize = video_samples.iter().map(|s| s.data.len()).sum();
    let audio_data_size: usize = audio_samples.iter().map(|s| s.data.len()).sum();
    let mdat_payload_size = video_data_size + audio_data_size;

    // Build moof to get its size (with placeholder offset)
    let moof_placeholder = build_moof_av(
        video_samples,
        audio_samples,
        sequence_number,
        video_base_decode_time,
        audio_base_decode_time,
        0, // placeholder video offset
        0, // placeholder audio offset
        has_audio,
    );
    let moof_size = moof_placeholder.len() as u32;

    // Calculate actual data offsets
    // Video data starts after moof + mdat header (8 bytes)
    let video_data_offset = moof_size + 8;
    // Audio data starts after video data
    let audio_data_offset = video_data_offset + video_data_size as u32;

    // Rebuild moof with correct offsets
    let moof = build_moof_av(
        video_samples,
        audio_samples,
        sequence_number,
        video_base_decode_time,
        audio_base_decode_time,
        video_data_offset,
        audio_data_offset,
        has_audio,
    );

    // Build complete segment
    let mut segment = Vec::with_capacity(moof.len() + 8 + mdat_payload_size);
    segment.extend_from_slice(&moof);

    // mdat header
    let mdat_size = (8 + mdat_payload_size) as u32;
    segment.extend_from_slice(&mdat_size.to_be_bytes());
    segment.extend_from_slice(b"mdat");

    // mdat payload: video samples first, then audio samples
    for sample in video_samples {
        segment.extend_from_slice(&sample.data);
    }
    for sample in audio_samples {
        segment.extend_from_slice(&sample.data);
    }

    segment
}

/// Build moof box with video and audio trafs
#[allow(clippy::too_many_arguments)]
fn build_moof_av(
    video_samples: &[VideoSample],
    audio_samples: &[AudioSample],
    sequence_number: u32,
    video_base_decode_time: u64,
    audio_base_decode_time: u64,
    video_data_offset: u32,
    audio_data_offset: u32,
    has_audio: bool,
) -> Vec<u8> {
    let mut payload = Vec::new();

    // mfhd (movie fragment header)
    let mfhd = build_mfhd(sequence_number);
    payload.extend_from_slice(&mfhd);

    // Video traf
    let video_traf = build_video_traf(video_samples, video_base_decode_time, video_data_offset);
    payload.extend_from_slice(&video_traf);

    // Audio traf (if enabled and has samples)
    if has_audio && !audio_samples.is_empty() {
        let audio_traf = build_audio_traf(audio_samples, audio_base_decode_time, audio_data_offset);
        payload.extend_from_slice(&audio_traf);
    }

    build_box(b"moof", &payload)
}

/// Build mfhd (movie fragment header) box
fn build_mfhd(sequence_number: u32) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&0u32.to_be_bytes()); // Version + flags
    payload.extend_from_slice(&sequence_number.to_be_bytes());
    build_box(b"mfhd", &payload)
}

/// Build video traf (track fragment) box
fn build_video_traf(
    samples: &[VideoSample],
    base_media_decode_time: u64,
    data_offset: u32,
) -> Vec<u8> {
    let mut payload = Vec::new();

    // tfhd (track fragment header)
    let tfhd = build_tfhd(1); // track_id = 1
    payload.extend_from_slice(&tfhd);

    // tfdt (track fragment decode time)
    let tfdt = build_tfdt(base_media_decode_time);
    payload.extend_from_slice(&tfdt);

    // trun (track run)
    let trun = build_video_trun(samples, data_offset);
    payload.extend_from_slice(&trun);

    build_box(b"traf", &payload)
}

/// Build audio traf (track fragment) box
fn build_audio_traf(
    samples: &[AudioSample],
    base_media_decode_time: u64,
    data_offset: u32,
) -> Vec<u8> {
    let mut payload = Vec::new();

    // tfhd (track fragment header)
    let tfhd = build_tfhd(2); // track_id = 2
    payload.extend_from_slice(&tfhd);

    // tfdt (track fragment decode time)
    let tfdt = build_tfdt(base_media_decode_time);
    payload.extend_from_slice(&tfdt);

    // trun (track run)
    let trun = build_audio_trun(samples, data_offset);
    payload.extend_from_slice(&trun);

    build_box(b"traf", &payload)
}

/// Build tfhd (track fragment header) box
fn build_tfhd(track_id: u32) -> Vec<u8> {
    // Flags: 0x020000 = default-base-is-moof
    let mut payload = Vec::new();
    payload.extend_from_slice(&0x0002_0000_u32.to_be_bytes()); // Version 0 + flags
    payload.extend_from_slice(&track_id.to_be_bytes());
    build_box(b"tfhd", &payload)
}

/// Build tfdt (track fragment decode time) box
fn build_tfdt(base_media_decode_time: u64) -> Vec<u8> {
    // Version 1 for 64-bit decode time
    let mut payload = Vec::new();
    payload.extend_from_slice(&0x0100_0000_u32.to_be_bytes()); // Version 1 + flags
    payload.extend_from_slice(&base_media_decode_time.to_be_bytes());
    build_box(b"tfdt", &payload)
}

/// Build video trun (track run) box
fn build_video_trun(samples: &[VideoSample], data_offset: u32) -> Vec<u8> {
    // Flags:
    // 0x000001 = data-offset-present
    // 0x000100 = sample-duration-present
    // 0x000200 = sample-size-present
    // 0x000400 = sample-flags-present
    // 0x000800 = sample-composition-time-offset-present
    let flags: u32 = 0x000001 | 0x000100 | 0x000200 | 0x000400 | 0x000800;

    let mut payload = Vec::new();
    // Version 1 for signed composition time offsets
    payload.extend_from_slice(&(0x0100_0000 | flags).to_be_bytes());
    payload.extend_from_slice(&(samples.len() as u32).to_be_bytes());
    payload.extend_from_slice(&data_offset.to_be_bytes());

    // Per-sample data
    for (i, sample) in samples.iter().enumerate() {
        // Sample duration
        let duration = if i + 1 < samples.len() {
            (samples[i + 1].dts - sample.dts) as u32
        } else if i > 0 {
            (sample.dts - samples[i - 1].dts) as u32
        } else {
            3000 // Default: 1 frame at 30fps
        };
        payload.extend_from_slice(&duration.to_be_bytes());

        // Sample size
        payload.extend_from_slice(&(sample.data.len() as u32).to_be_bytes());

        // Sample flags
        let flags = if sample.is_sync {
            0x0200_0000_u32 // depends_on = 2, is_non_sync = 0
        } else {
            0x0101_0000_u32 // depends_on = 1, is_non_sync = 1
        };
        payload.extend_from_slice(&flags.to_be_bytes());

        // Composition time offset (signed, pts - dts)
        let cts = (sample.pts as i64 - sample.dts as i64) as i32;
        payload.extend_from_slice(&cts.to_be_bytes());
    }

    build_box(b"trun", &payload)
}

/// Build audio trun (track run) box
fn build_audio_trun(samples: &[AudioSample], data_offset: u32) -> Vec<u8> {
    // Flags:
    // 0x000001 = data-offset-present
    // 0x000100 = sample-duration-present
    // 0x000200 = sample-size-present
    let flags: u32 = 0x000001 | 0x000100 | 0x000200;

    let mut payload = Vec::new();
    payload.extend_from_slice(&flags.to_be_bytes()); // Version 0 + flags
    payload.extend_from_slice(&(samples.len() as u32).to_be_bytes());
    payload.extend_from_slice(&data_offset.to_be_bytes());

    // Per-sample data
    for sample in samples {
        // Sample duration
        payload.extend_from_slice(&sample.duration.to_be_bytes());

        // Sample size
        payload.extend_from_slice(&(sample.data.len() as u32).to_be_bytes());
    }

    build_box(b"trun", &payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write as IoWrite;

    fn create_test_sps_pps() -> (Vec<u8>, Vec<u8>) {
        // Minimal valid H.264 SPS for 1280x720 video
        let sps: Vec<u8> = vec![
            0x67, // NAL header: type 7 (SPS)
            0x42, 0xC0, 0x1E, // profile_idc=66, constraint flags, level_idc=30
            0xD9, 0x00, 0x50, 0x05, 0xBA, 0x10, // SPS data for 1280x720
        ];

        // Minimal valid H.264 PPS
        let pps: Vec<u8> = vec![
            0x68, // NAL header: type 8 (PPS)
            0xCE, 0x3C, 0x80, // PPS data
        ];

        (sps, pps)
    }

    #[test]
    fn test_muxide_muxer_video_only() {
        let (sps, pps) = create_test_sps_pps();

        let config = MuxideConfig {
            video_width: 1280,
            video_height: 720,
            video_timescale: 90000,
            fragment_duration_ms: 2000,
            sps,
            pps,
            ..Default::default()
        };

        let mut muxer = MuxideMuxerState::new(config);
        muxer.init().unwrap();

        // Get init segment
        let init_segment = muxer.get_init_segment().unwrap();
        assert!(!init_segment.is_empty());
        assert_eq!(&init_segment[4..8], b"ftyp");

        // Push some fake video frames
        for i in 0..30 {
            let is_keyframe = i == 0;
            let nal_type: u8 = if is_keyframe { 0x65 } else { 0x41 };
            let nal_data = vec![nal_type, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
            let nal_len = nal_data.len() as u32;

            let mut avcc_data = Vec::new();
            avcc_data.extend_from_slice(&nal_len.to_be_bytes());
            avcc_data.extend_from_slice(&nal_data);

            let timestamp = (i as u64) * 33333; // ~30fps in microseconds
            muxer
                .push_video_chunk(&avcc_data, timestamp, is_keyframe)
                .unwrap();
        }

        // Get complete file
        let complete_file = muxer.get_complete_file().unwrap();

        // Write to file for manual inspection
        let output_path = "/tmp/test_muxide_video_only.mp4";
        let mut file = File::create(output_path).unwrap();
        file.write_all(&complete_file).unwrap();

        println!("✅ Generated video-only fMP4 at: {}", output_path);
        println!("📊 File size: {} bytes", complete_file.len());

        assert!(complete_file.len() > init_segment.len());
    }

    #[test]
    fn test_muxide_muxer_with_audio() {
        let (sps, pps) = create_test_sps_pps();

        let config = MuxideConfig {
            video_width: 1280,
            video_height: 720,
            video_timescale: 90000,
            fragment_duration_ms: 2000,
            sps,
            pps,
            audio_sample_rate: Some(48000),
            audio_channels: Some(2),
            audio_timescale: Some(48000),
            audio_specific_config: None, // Will be auto-generated
        };

        let mut muxer = MuxideMuxerState::new(config);
        assert!(muxer.has_audio());
        muxer.init().unwrap();

        // Get init segment
        let init_segment = muxer.get_init_segment().unwrap();
        assert!(!init_segment.is_empty());
        assert_eq!(&init_segment[4..8], b"ftyp");

        // Verify init segment contains audio track (mp4a box)
        assert!(
            init_segment.windows(4).any(|w| w == b"mp4a"),
            "Init segment should contain mp4a box"
        );

        // Push video and audio frames
        for i in 0..30 {
            let is_keyframe = i == 0;
            let nal_type: u8 = if is_keyframe { 0x65 } else { 0x41 };
            let nal_data = vec![nal_type, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
            let nal_len = nal_data.len() as u32;

            let mut avcc_data = Vec::new();
            avcc_data.extend_from_slice(&nal_len.to_be_bytes());
            avcc_data.extend_from_slice(&nal_data);

            let video_timestamp = (i as u64) * 33333; // ~30fps in microseconds
            muxer
                .push_video_chunk(&avcc_data, video_timestamp, is_keyframe)
                .unwrap();

            // Push ~3 audio frames per video frame (1024 samples @ 48kHz ≈ 21.33ms)
            for j in 0..3 {
                let audio_timestamp = video_timestamp + (j as u64) * 21333;
                // Fake AAC frame (just some bytes, not valid AAC but sufficient for structure test)
                let audio_data = vec![0x21, 0x10, 0x04, 0x60, 0x8c, 0x1c, 0x00, 0x00];
                let duration = 21333u32; // ~21.33ms in microseconds
                muxer
                    .push_audio_chunk(&audio_data, audio_timestamp, duration)
                    .unwrap();
            }
        }

        // Get complete file
        let complete_file = muxer.get_complete_file().unwrap();

        // Write to file for manual inspection
        let output_path = "/tmp/test_muxide_with_audio.mp4";
        let mut file = File::create(output_path).unwrap();
        file.write_all(&complete_file).unwrap();

        println!("✅ Generated fMP4 with audio at: {}", output_path);
        println!("📊 File size: {} bytes", complete_file.len());
        println!("🎬 Test with: ffprobe -show_streams {}", output_path);

        assert!(complete_file.len() > init_segment.len());
        assert!(muxer.video_frame_count > 0);
        assert!(muxer.audio_frame_count > 0);
    }

    #[test]
    fn test_audio_specific_config_generation() {
        // Test 48kHz stereo
        let asc = build_audio_specific_config(48000, 2);
        assert_eq!(asc.len(), 2);
        // audioObjectType = 2 (AAC-LC), samplingFrequencyIndex = 3 (48kHz), channelConfiguration = 2
        assert_eq!(asc[0], 0x11); // (2 << 3) | (3 >> 1) = 0x10 | 0x01 = 0x11
        assert_eq!(asc[1], 0x90); // ((3 & 1) << 7) | (2 << 3) = 0x80 | 0x10 = 0x90

        // Test 44.1kHz mono
        let asc = build_audio_specific_config(44100, 1);
        assert_eq!(asc.len(), 2);
        // audioObjectType = 2, samplingFrequencyIndex = 4 (44.1kHz), channelConfiguration = 1
        assert_eq!(asc[0], 0x12); // (2 << 3) | (4 >> 1) = 0x10 | 0x02 = 0x12
        assert_eq!(asc[1], 0x08); // ((4 & 1) << 7) | (1 << 3) = 0x00 | 0x08 = 0x08
    }

    #[test]
    fn test_audio_not_configured_error() {
        let (sps, pps) = create_test_sps_pps();

        let config = MuxideConfig {
            video_width: 1280,
            video_height: 720,
            video_timescale: 90000,
            fragment_duration_ms: 2000,
            sps,
            pps,
            audio_sample_rate: None, // Audio not configured
            audio_channels: None,
            ..Default::default()
        };

        let mut muxer = MuxideMuxerState::new(config);
        assert!(!muxer.has_audio());
        muxer.init().unwrap();

        // Attempting to push audio should fail
        let result = muxer.push_audio_chunk(&[0x00], 0, 1024);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Audio not configured"));
    }

    #[test]
    fn test_extract_sps_pps() {
        // Sample avcC data
        let avcc: Vec<u8> = vec![
            0x01, // configurationVersion
            0x42, // AVCProfileIndication (Baseline)
            0xC0, // profile_compatibility
            0x1E, // AVCLevelIndication (level 3.0)
            0xFF, // lengthSizeMinusOne (3 = 4-byte NAL lengths)
            0xE1, // numOfSequenceParameterSets (1)
            0x00, 0x0A, // SPS length (10)
            0x67, 0x42, 0xC0, 0x1E, 0xD9, 0x00, 0x50, 0x05, 0xBA, 0x10, // SPS
            0x01, // numOfPictureParameterSets
            0x00, 0x04, // PPS length (4)
            0x68, 0xCE, 0x3C, 0x80, // PPS
        ];

        let (sps, pps) = extract_sps_pps_from_avcc(&avcc).unwrap();

        assert_eq!(sps.len(), 10);
        assert_eq!(sps[0], 0x67); // SPS NAL type
        assert_eq!(pps.len(), 4);
        assert_eq!(pps[0], 0x68); // PPS NAL type
    }

    #[test]
    fn test_annex_b_to_avcc() {
        // Annex B with 4-byte start codes
        let annex_b = vec![
            0x00, 0x00, 0x00, 0x01, // Start code
            0x67, 0x42, 0xC0, 0x1E, // SPS NAL
            0x00, 0x00, 0x00, 0x01, // Start code
            0x68, 0xCE, 0x3C, 0x80, // PPS NAL
        ];

        let avcc = annex_b_to_avcc(&annex_b);

        // Check first NAL
        let len1 = u32::from_be_bytes([avcc[0], avcc[1], avcc[2], avcc[3]]);
        assert_eq!(len1, 4);
        assert_eq!(avcc[4], 0x67); // SPS

        // Check second NAL
        let offset = 4 + len1 as usize;
        let len2 = u32::from_be_bytes([
            avcc[offset],
            avcc[offset + 1],
            avcc[offset + 2],
            avcc[offset + 3],
        ]);
        assert_eq!(len2, 4);
        assert_eq!(avcc[offset + 4], 0x68); // PPS
    }
}
