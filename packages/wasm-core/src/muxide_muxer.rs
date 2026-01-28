//! Muxer implementation using the muxide library for correct fMP4 generation.
//!
//! This module provides a muxer that generates fragmented MP4 files compatible
//! with QuickTime and other players that have strict fMP4 requirements.

use muxide::fragmented::{FragmentConfig, FragmentedMuxer};

/// Configuration for the muxide-based muxer
#[derive(Debug, Clone)]
pub struct MuxideConfig {
    pub video_width: u32,
    pub video_height: u32,
    pub video_timescale: u32,
    pub fragment_duration_ms: u32,
    /// SPS NAL unit (without start code, required for H.264)
    pub sps: Vec<u8>,
    /// PPS NAL unit (without start code, required for H.264)
    pub pps: Vec<u8>,
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
        }
    }
}

/// State machine for fMP4 muxing using muxide library
pub struct MuxideMuxerState {
    muxer: Option<FragmentedMuxer>,
    config: MuxideConfig,
    initialized: bool,
    init_segment: Vec<u8>,
    pending_segments: Vec<Vec<u8>>,
    pub video_frame_count: u32,
}

impl MuxideMuxerState {
    /// Create a new MuxideMuxerState with the given configuration
    pub fn new(config: MuxideConfig) -> Self {
        Self {
            muxer: None,
            config,
            initialized: false,
            init_segment: Vec::new(),
            pending_segments: Vec::new(),
            video_frame_count: 0,
        }
    }

    /// Initialize the muxer and generate fMP4 header (ftyp + moov)
    pub fn init(&mut self) -> Result<(), String> {
        if self.initialized {
            return Err("Muxer already initialized".to_string());
        }

        if self.config.sps.is_empty() || self.config.pps.is_empty() {
            return Err("SPS and PPS are required for initialization".to_string());
        }

        let fragment_config = FragmentConfig {
            width: self.config.video_width,
            height: self.config.video_height,
            timescale: self.config.video_timescale,
            fragment_duration_ms: self.config.fragment_duration_ms,
            sps: self.config.sps.clone(),
            pps: self.config.pps.clone(),
        };

        let mut muxer = FragmentedMuxer::new(fragment_config);
        self.init_segment = muxer.init_segment();
        self.muxer = Some(muxer);
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

        let muxer = self.muxer.as_mut().ok_or("Muxer not available")?;

        // Convert timestamp from microseconds to timescale units
        let pts = (timestamp * self.config.video_timescale as u64) / 1_000_000;
        let dts = pts; // No B-frames, so PTS == DTS

        muxer.write_video(pts, dts, data, is_keyframe);
        self.video_frame_count += 1;

        // Check if we have a complete segment ready
        if let Some(segment) = muxer.flush_segment() {
            self.pending_segments.push(segment);
        }

        Ok(())
    }

    /// Force flush the current segment even if it hasn't reached the target duration
    pub fn force_flush(&mut self) -> Result<(), String> {
        if !self.initialized {
            return Err("Muxer not initialized".to_string());
        }

        let muxer = self.muxer.as_mut().ok_or("Muxer not available")?;

        if let Some(segment) = muxer.flush_segment() {
            self.pending_segments.push(segment);
        }

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write as IoWrite;

    #[test]
    fn test_muxide_muxer_basic() {
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

        let config = MuxideConfig {
            video_width: 1280,
            video_height: 720,
            video_timescale: 90000,
            fragment_duration_ms: 2000,
            sps,
            pps,
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
            muxer.push_video_chunk(&avcc_data, timestamp, is_keyframe).unwrap();
        }

        // Get complete file
        let complete_file = muxer.get_complete_file().unwrap();

        // Write to file for manual inspection
        let output_path = "/tmp/test_muxide_muxer.mp4";
        let mut file = File::create(output_path).unwrap();
        file.write_all(&complete_file).unwrap();

        println!("✅ Generated muxide-based fMP4 at: {}", output_path);
        println!("📊 File size: {} bytes", complete_file.len());
        println!("🎬 Test with QuickTime: open {}", output_path);

        assert!(complete_file.len() > init_segment.len());
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
        let len2 = u32::from_be_bytes([avcc[offset], avcc[offset + 1], avcc[offset + 2], avcc[offset + 3]]);
        assert_eq!(len2, 4);
        assert_eq!(avcc[offset + 4], 0x68); // PPS
    }
}
