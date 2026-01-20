use std::io::Write;

/// Configuration for the muxer
#[derive(Debug, Clone)]
pub struct MuxerConfig {
    pub video_codec: String,
    pub audio_codec: String,
    pub video_width: u32,
    pub video_height: u32,
    pub video_timescale: u32,
    pub audio_timescale: u32,
    pub audio_sample_rate: u32,
    pub audio_channels: u16,
    pub video_codec_config: Option<Vec<u8>>,
    pub audio_codec_config: Option<Vec<u8>>,
}

impl Default for MuxerConfig {
    fn default() -> Self {
        Self {
            video_codec: "avc1".to_string(),
            audio_codec: "mp4a".to_string(),
            video_width: 1280,
            video_height: 720,
            video_timescale: 30000,
            audio_timescale: 48000,
            audio_sample_rate: 48000,
            audio_channels: 2,
            video_codec_config: None,
            audio_codec_config: None,
        }
    }
}

/// State machine for fMP4 muxing
pub struct MuxerState {
    #[allow(dead_code)]
    config: MuxerConfig,
    buffer: Vec<u8>,
    pub video_sequence_number: u32,
    pub audio_sequence_number: u32,
    initialized: bool,
}

impl MuxerState {
    /// Create a new MuxerState with the given configuration
    pub fn new(config: MuxerConfig) -> Self {
        Self {
            config,
            buffer: Vec::new(),
            video_sequence_number: 0,
            audio_sequence_number: 0,
            initialized: false,
        }
    }

    /// Initialize the muxer and generate fMP4 header (ftyp + moov)
    pub fn init(&mut self) -> Result<(), String> {
        if self.initialized {
            return Err("Muxer already initialized".to_string());
        }

        self.buffer.clear();

        // Generate ftyp box (File Type Box)
        self.write_ftyp()?;

        // Generate moov box (Movie Box) with minimal metadata for fragmented MP4
        self.write_moov()?;

        self.initialized = true;

        Ok(())
    }

    /// Add a video chunk and generate moof + mdat fragment
    pub fn push_video_chunk(
        &mut self,
        data: &[u8],
        timestamp: u64,
        is_keyframe: bool,
    ) -> Result<(), String> {
        if !self.initialized {
            return Err("Muxer not initialized".to_string());
        }

        self.video_sequence_number += 1;

        // Convert timestamp from microseconds to timescale units
        // timescale = 30000, so: timestamp_in_timescale = (timestamp_us * 30000) / 1_000_000
        let timestamp_scaled = (timestamp * self.config.video_timescale as u64) / 1_000_000;

        // Generate moof (Movie Fragment Box)
        self.write_moof_video(timestamp_scaled, data.len() as u32, is_keyframe)?;

        // Generate mdat (Media Data Box)
        self.write_mdat(data)?;

        Ok(())
    }

    /// Add an audio chunk and generate moof + mdat fragment
    pub fn push_audio_chunk(&mut self, data: &[u8], timestamp: u64) -> Result<(), String> {
        if !self.initialized {
            return Err("Muxer not initialized".to_string());
        }

        self.audio_sequence_number += 1;

        // Convert timestamp from microseconds to timescale units
        // timescale = 48000 (or configured), so: timestamp_in_timescale = (timestamp_us * timescale) / 1_000_000
        let timestamp_scaled = (timestamp * self.config.audio_timescale as u64) / 1_000_000;

        // Generate moof (Movie Fragment Box)
        self.write_moof_audio(timestamp_scaled, data.len() as u32)?;

        // Generate mdat (Media Data Box)
        self.write_mdat(data)?;

        Ok(())
    }

    /// Get the current fMP4 fragment and reset the buffer
    pub fn get_fragment(&mut self) -> Vec<u8> {
        std::mem::take(&mut self.buffer)
    }

    // Helper methods for writing fMP4 boxes

    fn write_ftyp(&mut self) -> Result<(), String> {
        // ftyp box structure:
        // - size (4 bytes)
        // - type 'ftyp' (4 bytes)
        // - major brand (4 bytes) - 'iso5' for fragmented MP4
        // - minor version (4 bytes)
        // - compatible brands (4 bytes each)

        let ftyp_data = [
            // major_brand: 'iso5'
            b'i', b's', b'o', b'5', // minor_version: 512
            0x00, 0x00, 0x02, 0x00, // compatible_brands: iso5, iso6, mp41
            b'i', b's', b'o', b'5', b'i', b's', b'o', b'6', b'm', b'p', b'4', b'1',
        ];

        let size = 8 + ftyp_data.len() as u32;
        self.write_box_header(size, b"ftyp")?;
        self.buffer
            .write_all(&ftyp_data)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_moov(&mut self) -> Result<(), String> {
        // For fragmented MP4, moov box contains minimal metadata
        // Real implementation would write proper track metadata here
        // For now, we'll write a minimal moov box

        let mut moov_data = Vec::new();

        // mvhd (Movie Header Box)
        self.write_mvhd(&mut moov_data)?;

        // trak (Track Box) - Video
        self.write_trak_video(&mut moov_data)?;

        // trak (Track Box) - Audio
        self.write_trak_audio(&mut moov_data)?;

        // mvex (Movie Extends Box) - required for fragmented MP4
        self.write_mvex(&mut moov_data)?;

        let size = 8 + moov_data.len() as u32;
        self.write_box_header(size, b"moov")?;
        self.buffer
            .write_all(&moov_data)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_mvhd(&self, buf: &mut Vec<u8>) -> Result<(), String> {
        // mvhd (Movie Header Box)
        let timescale = self.config.video_timescale;

        let mut mvhd_data = vec![
            // version(1) + flags(3)
            0x00, 0x00, 0x00, 0x00, // creation_time
            0x00, 0x00, 0x00, 0x00, // modification_time
            0x00, 0x00, 0x00, 0x00,
        ];

        // timescale (big-endian)
        mvhd_data.push((timescale >> 24) as u8);
        mvhd_data.push((timescale >> 16) as u8);
        mvhd_data.push((timescale >> 8) as u8);
        mvhd_data.push(timescale as u8);

        mvhd_data.extend_from_slice(&[
            // duration (0 for live/fragmented)
            0x00, 0x00, 0x00, 0x00, // rate (1.0 = 0x00010000)
            0x00, 0x01, 0x00, 0x00, // volume (1.0 = 0x0100)
            0x01, 0x00, // reserved
            0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // matrix (identity matrix)
            0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, // pre_defined (6 x 4 bytes)
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // next_track_ID
            0x00, 0x00, 0x00, 0x03, // Track 1: video, Track 2: audio
        ]);

        let size = 8 + mvhd_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"mvhd")?;
        buf.write_all(&mvhd_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_trak_video(&self, buf: &mut Vec<u8>) -> Result<(), String> {
        let mut trak_data = Vec::new();

        // tkhd (Track Header)
        self.write_tkhd(&mut trak_data, 1, true)?;

        // mdia (Media)
        self.write_mdia(&mut trak_data, 1, self.config.video_timescale, true)?;

        let size = 8 + trak_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"trak")?;
        buf.write_all(&trak_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_trak_audio(&self, buf: &mut Vec<u8>) -> Result<(), String> {
        let mut trak_data = Vec::new();

        // tkhd (Track Header)
        self.write_tkhd(&mut trak_data, 2, false)?;

        // mdia (Media)
        self.write_mdia(&mut trak_data, 2, self.config.audio_timescale, false)?;

        let size = 8 + trak_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"trak")?;
        buf.write_all(&trak_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_tkhd(&self, buf: &mut Vec<u8>, track_id: u32, is_video: bool) -> Result<(), String> {
        let flags = 0x000007; // track_enabled | track_in_movie | track_in_preview

        let mut tkhd_data = vec![
            // version(1) + flags(3)
            0x00,
            (flags >> 16) as u8,
            (flags >> 8) as u8,
            flags as u8,
            // creation_time
            0x00,
            0x00,
            0x00,
            0x00,
            // modification_time
            0x00,
            0x00,
            0x00,
            0x00,
        ];

        // track_ID
        tkhd_data.push((track_id >> 24) as u8);
        tkhd_data.push((track_id >> 16) as u8);
        tkhd_data.push((track_id >> 8) as u8);
        tkhd_data.push(track_id as u8);

        tkhd_data.extend_from_slice(&[
            // reserved
            0x00, 0x00, 0x00, 0x00, // duration
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // layer
            0x00, 0x00, // alternate_group
            0x00, 0x00,
        ]);

        // volume (1.0 for audio, 0.0 for video)
        if is_video {
            tkhd_data.extend_from_slice(&[0x00, 0x00]);
        } else {
            tkhd_data.extend_from_slice(&[0x01, 0x00]);
        }

        tkhd_data.extend_from_slice(&[
            // reserved
            0x00, 0x00, // matrix (identity)
            0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
        ]);

        if is_video {
            // width (fixed point 16.16)
            let width = self.config.video_width;
            tkhd_data.push((width >> 8) as u8);
            tkhd_data.push(width as u8);
            tkhd_data.extend_from_slice(&[0x00, 0x00]);

            // height (fixed point 16.16)
            let height = self.config.video_height;
            tkhd_data.push((height >> 8) as u8);
            tkhd_data.push(height as u8);
            tkhd_data.extend_from_slice(&[0x00, 0x00]);
        } else {
            // width and height = 0 for audio
            tkhd_data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]);
            tkhd_data.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]);
        }

        let size = 8 + tkhd_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"tkhd")?;
        buf.write_all(&tkhd_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_mdia(
        &self,
        buf: &mut Vec<u8>,
        _track_id: u32,
        timescale: u32,
        is_video: bool,
    ) -> Result<(), String> {
        let mut mdia_data = Vec::new();

        // mdhd (Media Header)
        self.write_mdhd(&mut mdia_data, timescale)?;

        // hdlr (Handler Reference)
        self.write_hdlr(&mut mdia_data, is_video)?;

        // minf (Media Information)
        self.write_minf(&mut mdia_data, is_video)?;

        let size = 8 + mdia_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"mdia")?;
        buf.write_all(&mdia_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_mdhd(&self, buf: &mut Vec<u8>, timescale: u32) -> Result<(), String> {
        let mut mdhd_data = vec![
            // version(1) + flags(3)
            0x00, 0x00, 0x00, 0x00, // creation_time
            0x00, 0x00, 0x00, 0x00, // modification_time
            0x00, 0x00, 0x00, 0x00,
        ];

        // timescale
        mdhd_data.push((timescale >> 24) as u8);
        mdhd_data.push((timescale >> 16) as u8);
        mdhd_data.push((timescale >> 8) as u8);
        mdhd_data.push(timescale as u8);

        mdhd_data.extend_from_slice(&[
            // duration
            0x00, 0x00, 0x00, 0x00, // language (und = 0x55c4)
            0x55, 0xc4, // pre_defined
            0x00, 0x00,
        ]);

        let size = 8 + mdhd_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"mdhd")?;
        buf.write_all(&mdhd_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_hdlr(&self, buf: &mut Vec<u8>, is_video: bool) -> Result<(), String> {
        let handler_type = if is_video { b"vide" } else { b"soun" };
        let name = if is_video {
            b"VideoHandler\0"
        } else {
            b"SoundHandler\0"
        };

        let mut hdlr_data = vec![
            // version(1) + flags(3)
            0x00, 0x00, 0x00, 0x00, // pre_defined
            0x00, 0x00, 0x00, 0x00,
        ];

        // handler_type
        hdlr_data.extend_from_slice(handler_type);

        hdlr_data.extend_from_slice(&[
            // reserved
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]);

        // name
        hdlr_data.extend_from_slice(name);

        let size = 8 + hdlr_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"hdlr")?;
        buf.write_all(&hdlr_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_minf(&self, buf: &mut Vec<u8>, is_video: bool) -> Result<(), String> {
        let mut minf_data = Vec::new();

        // vmhd or smhd
        if is_video {
            self.write_vmhd(&mut minf_data)?;
        } else {
            self.write_smhd(&mut minf_data)?;
        }

        // dinf (Data Information)
        self.write_dinf(&mut minf_data)?;

        // stbl (Sample Table) - minimal for fragmented MP4
        self.write_stbl(&mut minf_data, is_video)?;

        let size = 8 + minf_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"minf")?;
        buf.write_all(&minf_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_vmhd(&self, buf: &mut Vec<u8>) -> Result<(), String> {
        let vmhd_data = [
            // version(1) + flags(3) - flags = 1
            0x00, 0x00, 0x00, 0x01, // graphicsmode
            0x00, 0x00, // opcolor (RGB)
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];

        let size = 8 + vmhd_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"vmhd")?;
        buf.write_all(&vmhd_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_smhd(&self, buf: &mut Vec<u8>) -> Result<(), String> {
        let smhd_data = [
            // version(1) + flags(3)
            0x00, 0x00, 0x00, 0x00, // balance
            0x00, 0x00, // reserved
            0x00, 0x00,
        ];

        let size = 8 + smhd_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"smhd")?;
        buf.write_all(&smhd_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_dinf(&self, buf: &mut Vec<u8>) -> Result<(), String> {
        let mut dinf_data = Vec::new();

        // dref (Data Reference)
        let mut dref_data = vec![
            // version(1) + flags(3)
            0x00, 0x00, 0x00, 0x00, // entry_count
            0x00, 0x00, 0x00, 0x01,
        ];

        // url entry
        let url_data = [
            // version(1) + flags(3) - flags = 1 (data is in same file)
            0x00, 0x00, 0x00, 0x01,
        ];

        let url_size = 8 + url_data.len() as u32;
        dref_data.push((url_size >> 24) as u8);
        dref_data.push((url_size >> 16) as u8);
        dref_data.push((url_size >> 8) as u8);
        dref_data.push(url_size as u8);
        dref_data.extend_from_slice(b"url ");
        dref_data.extend_from_slice(&url_data);

        let dref_size = 8 + dref_data.len() as u32;
        self.write_box_header_to_buf(&mut dinf_data, dref_size, b"dref")?;
        dinf_data.write_all(&dref_data).map_err(|e| e.to_string())?;

        let size = 8 + dinf_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"dinf")?;
        buf.write_all(&dinf_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_stbl(&self, buf: &mut Vec<u8>, is_video: bool) -> Result<(), String> {
        let mut stbl_data = Vec::new();

        // stsd (Sample Description)
        let mut stsd_data = vec![
            // version(1) + flags(3)
            0x00, 0x00, 0x00, 0x00, // entry_count
            0x00, 0x00, 0x00, 0x01,
        ];

        // Build sample entry based on codec type
        if is_video {
            // Build avc1 (H.264) sample entry
            let mut sample_entry = Vec::new();

            // SampleEntry fields (8 bytes)
            sample_entry.extend_from_slice(&[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
                0x00, 0x01, // data_reference_index = 1
            ]);

            // VisualSampleEntry fields (70 bytes)
            sample_entry.extend_from_slice(&[
                0x00, 0x00, // pre_defined
                0x00, 0x00, // reserved
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, // pre_defined[12]
            ]);

            // width (2 bytes)
            sample_entry.extend_from_slice(&(self.config.video_width as u16).to_be_bytes());
            // height (2 bytes)
            sample_entry.extend_from_slice(&(self.config.video_height as u16).to_be_bytes());

            sample_entry.extend_from_slice(&[
                0x00, 0x48, 0x00, 0x00, // horizresolution = 72 dpi (16.16 fixed point)
                0x00, 0x48, 0x00, 0x00, // vertresolution = 72 dpi (16.16 fixed point)
                0x00, 0x00, 0x00, 0x00, // reserved
                0x00, 0x01, // frame_count = 1
                // compressorname (32 bytes) - Pascal string
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x18, // depth = 24 (0x0018)
                0xFF, 0xFF, // pre_defined = -1
            ]);

            // Add avcC box if config is available
            if let Some(ref config) = self.config.video_codec_config {
                let avcc_size = 8 + config.len() as u32;
                sample_entry.extend_from_slice(&avcc_size.to_be_bytes());
                sample_entry.extend_from_slice(b"avcC");
                sample_entry.extend_from_slice(config);
            }

            // Write sample entry with size
            let entry_size = 8
                + 8
                + 70
                + if self.config.video_codec_config.is_some() {
                    8 + self.config.video_codec_config.as_ref().unwrap().len()
                } else {
                    0
                };
            stsd_data.extend_from_slice(&(entry_size as u32).to_be_bytes());
            stsd_data.extend_from_slice(b"avc1");
            stsd_data.extend_from_slice(&sample_entry);
        } else {
            // Build mp4a (AAC) sample entry
            let mut sample_entry = Vec::new();

            // SampleEntry fields (8 bytes)
            sample_entry.extend_from_slice(&[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved
                0x00, 0x01, // data_reference_index = 1
            ]);

            // AudioSampleEntry fields (20 bytes)
            sample_entry.extend_from_slice(&[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // reserved[8]
            ]);

            // channelcount (2 bytes)
            sample_entry.extend_from_slice(&self.config.audio_channels.to_be_bytes());

            sample_entry.extend_from_slice(&[
                0x00, 0x10, // samplesize = 16 bits
                0x00, 0x00, // pre_defined
                0x00, 0x00, // reserved
            ]);

            // samplerate (4 bytes) - 16.16 fixed point
            sample_entry.extend_from_slice(&(self.config.audio_sample_rate << 16).to_be_bytes());

            // Add esds box if config is available
            if let Some(ref config) = self.config.audio_codec_config {
                let esds_size = 8 + config.len() as u32;
                sample_entry.extend_from_slice(&esds_size.to_be_bytes());
                sample_entry.extend_from_slice(b"esds");
                sample_entry.extend_from_slice(config);
            }

            // Write sample entry with size
            let entry_size = 8
                + 8
                + 20
                + if self.config.audio_codec_config.is_some() {
                    8 + self.config.audio_codec_config.as_ref().unwrap().len()
                } else {
                    0
                };
            stsd_data.extend_from_slice(&(entry_size as u32).to_be_bytes());
            stsd_data.extend_from_slice(b"mp4a");
            stsd_data.extend_from_slice(&sample_entry);
        }

        let stsd_size = 8 + stsd_data.len() as u32;
        self.write_box_header_to_buf(&mut stbl_data, stsd_size, b"stsd")?;
        stbl_data.write_all(&stsd_data).map_err(|e| e.to_string())?;

        // stts (Time to Sample)
        let stts_data = [
            0x00, 0x00, 0x00, 0x00, // version + flags
            0x00, 0x00, 0x00, 0x00, // entry_count
        ];
        let stts_size = 8 + stts_data.len() as u32;
        self.write_box_header_to_buf(&mut stbl_data, stts_size, b"stts")?;
        stbl_data.write_all(&stts_data).map_err(|e| e.to_string())?;

        // stsc (Sample to Chunk)
        let stsc_data = [
            0x00, 0x00, 0x00, 0x00, // version + flags
            0x00, 0x00, 0x00, 0x00, // entry_count
        ];
        let stsc_size = 8 + stsc_data.len() as u32;
        self.write_box_header_to_buf(&mut stbl_data, stsc_size, b"stsc")?;
        stbl_data.write_all(&stsc_data).map_err(|e| e.to_string())?;

        // stsz (Sample Size)
        let stsz_data = [
            0x00, 0x00, 0x00, 0x00, // version + flags
            0x00, 0x00, 0x00, 0x00, // sample_size
            0x00, 0x00, 0x00, 0x00, // sample_count
        ];
        let stsz_size = 8 + stsz_data.len() as u32;
        self.write_box_header_to_buf(&mut stbl_data, stsz_size, b"stsz")?;
        stbl_data.write_all(&stsz_data).map_err(|e| e.to_string())?;

        // stco (Chunk Offset)
        let stco_data = [
            0x00, 0x00, 0x00, 0x00, // version + flags
            0x00, 0x00, 0x00, 0x00, // entry_count
        ];
        let stco_size = 8 + stco_data.len() as u32;
        self.write_box_header_to_buf(&mut stbl_data, stco_size, b"stco")?;
        stbl_data.write_all(&stco_data).map_err(|e| e.to_string())?;

        let size = 8 + stbl_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"stbl")?;
        buf.write_all(&stbl_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_mvex(&self, buf: &mut Vec<u8>) -> Result<(), String> {
        let mut mvex_data = Vec::new();

        // trex for video track (track_id = 1)
        self.write_trex(&mut mvex_data, 1)?;

        // trex for audio track (track_id = 2)
        self.write_trex(&mut mvex_data, 2)?;

        let size = 8 + mvex_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"mvex")?;
        buf.write_all(&mvex_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_trex(&self, buf: &mut Vec<u8>, track_id: u32) -> Result<(), String> {
        let mut trex_data = vec![
            // version(1) + flags(3)
            0x00, 0x00, 0x00, 0x00,
        ];

        // track_ID
        trex_data.push((track_id >> 24) as u8);
        trex_data.push((track_id >> 16) as u8);
        trex_data.push((track_id >> 8) as u8);
        trex_data.push(track_id as u8);

        trex_data.extend_from_slice(&[
            // default_sample_description_index
            0x00, 0x00, 0x00, 0x01, // default_sample_duration
            0x00, 0x00, 0x00, 0x00, // default_sample_size
            0x00, 0x00, 0x00, 0x00, // default_sample_flags
            0x00, 0x00, 0x00, 0x00,
        ]);

        let size = 8 + trex_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"trex")?;
        buf.write_all(&trex_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_moof_video(
        &mut self,
        timestamp: u64,
        data_size: u32,
        is_keyframe: bool,
    ) -> Result<(), String> {
        // moof (Movie Fragment Box) structure:
        // - mfhd (Movie Fragment Header)
        // - traf (Track Fragment)
        //   - tfhd (Track Fragment Header)
        //   - tfdt (Track Fragment Decode Time)
        //   - trun (Track Fragment Run)

        // Calculate moof size (fixed for our structure):
        // moof header(8) + mfhd(16) + traf header(8) + tfhd(16) + tfdt(20) + trun(28)
        // = 8 + 16 + (8 + 16 + 20 + 28) = 8 + 16 + 72 = 96
        let moof_size = 96;

        let mut moof_data = Vec::new();

        // mfhd
        self.write_mfhd(&mut moof_data, self.video_sequence_number)?;

        // traf for video (track_id = 1)
        self.write_traf(
            &mut moof_data,
            1,
            timestamp,
            data_size,
            moof_size,
            is_keyframe,
        )?;

        let size = 8 + moof_data.len() as u32;
        self.write_box_header(size, b"moof")?;
        self.buffer
            .write_all(&moof_data)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_moof_audio(&mut self, timestamp: u64, data_size: u32) -> Result<(), String> {
        // Calculate moof size (fixed for our structure):
        // moof header(8) + mfhd(16) + traf header(8) + tfhd(16) + tfdt(20) + trun(28)
        // = 8 + 16 + (8 + 16 + 20 + 28) = 8 + 16 + 72 = 96
        let moof_size = 96;

        let mut moof_data = Vec::new();

        // mfhd
        self.write_mfhd(&mut moof_data, self.audio_sequence_number)?;

        // traf for audio (track_id = 2)
        self.write_traf(&mut moof_data, 2, timestamp, data_size, moof_size, false)?;

        let size = 8 + moof_data.len() as u32;
        self.write_box_header(size, b"moof")?;
        self.buffer
            .write_all(&moof_data)
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_mfhd(&self, buf: &mut Vec<u8>, sequence_number: u32) -> Result<(), String> {
        let mfhd_data = [
            // version(1) + flags(3)
            0x00,
            0x00,
            0x00,
            0x00,
            // sequence_number
            (sequence_number >> 24) as u8,
            (sequence_number >> 16) as u8,
            (sequence_number >> 8) as u8,
            sequence_number as u8,
        ];

        let size = 8 + mfhd_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"mfhd")?;
        buf.write_all(&mfhd_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_traf(
        &self,
        buf: &mut Vec<u8>,
        track_id: u32,
        timestamp: u64,
        data_size: u32,
        moof_size: u32,
        is_keyframe: bool,
    ) -> Result<(), String> {
        let mut traf_data = Vec::new();

        // tfhd (Track Fragment Header)
        self.write_tfhd(&mut traf_data, track_id)?;

        // tfdt (Track Fragment Decode Time)
        self.write_tfdt(&mut traf_data, timestamp)?;

        // Calculate sample duration based on track type
        let sample_duration = if track_id == 1 {
            // Video track: 30fps = 30000 timescale / 30 fps = 1000 units per frame
            self.config.video_timescale / 30
        } else {
            // Audio track: AAC typically has 1024 samples per frame
            // At 48000 Hz timescale, 1024 samples = 1024 timescale units
            1024
        };

        // Calculate data_offset: from start of moof to start of mdat data
        // data_offset = moof_size + mdat_header_size
        let data_offset = moof_size + 8;

        // trun (Track Fragment Run)
        self.write_trun(
            &mut traf_data,
            data_size,
            sample_duration,
            data_offset,
            is_keyframe,
        )?;

        let size = 8 + traf_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"traf")?;
        buf.write_all(&traf_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_tfhd(&self, buf: &mut Vec<u8>, track_id: u32) -> Result<(), String> {
        // flags: default-base-is-moof (0x020000)
        let flags = 0x020000;

        let mut tfhd_data = vec![
            // version(1) + flags(3)
            0x00,
            (flags >> 16) as u8,
            (flags >> 8) as u8,
            flags as u8,
        ];

        // track_ID
        tfhd_data.push((track_id >> 24) as u8);
        tfhd_data.push((track_id >> 16) as u8);
        tfhd_data.push((track_id >> 8) as u8);
        tfhd_data.push(track_id as u8);

        let size = 8 + tfhd_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"tfhd")?;
        buf.write_all(&tfhd_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_tfdt(&self, buf: &mut Vec<u8>, base_media_decode_time: u64) -> Result<(), String> {
        let tfdt_data = [
            // version(1) + flags(3) - version 1 for 64-bit time
            0x01,
            0x00,
            0x00,
            0x00,
            // baseMediaDecodeTime (64-bit)
            (base_media_decode_time >> 56) as u8,
            (base_media_decode_time >> 48) as u8,
            (base_media_decode_time >> 40) as u8,
            (base_media_decode_time >> 32) as u8,
            (base_media_decode_time >> 24) as u8,
            (base_media_decode_time >> 16) as u8,
            (base_media_decode_time >> 8) as u8,
            base_media_decode_time as u8,
        ];

        let size = 8 + tfdt_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"tfdt")?;
        buf.write_all(&tfdt_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_trun(
        &self,
        buf: &mut Vec<u8>,
        sample_size: u32,
        sample_duration: u32,
        data_offset: u32,
        _is_keyframe: bool,
    ) -> Result<(), String> {
        // flags: data-offset-present (0x000001) + sample-duration-present (0x000100) + sample-size-present (0x000200)
        let flags = 0x000301;

        let mut trun_data = vec![
            // version + flags
            0x00,
            (flags >> 16) as u8,
            (flags >> 8) as u8,
            flags as u8,
        ];

        // sample_count
        trun_data.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);

        // data_offset - offset from moof start to mdat data
        trun_data.push((data_offset >> 24) as u8);
        trun_data.push((data_offset >> 16) as u8);
        trun_data.push((data_offset >> 8) as u8);
        trun_data.push(data_offset as u8);

        // sample_duration
        trun_data.push((sample_duration >> 24) as u8);
        trun_data.push((sample_duration >> 16) as u8);
        trun_data.push((sample_duration >> 8) as u8);
        trun_data.push(sample_duration as u8);

        // sample_size
        trun_data.push((sample_size >> 24) as u8);
        trun_data.push((sample_size >> 16) as u8);
        trun_data.push((sample_size >> 8) as u8);
        trun_data.push(sample_size as u8);

        let size = 8 + trun_data.len() as u32;
        self.write_box_header_to_buf(buf, size, b"trun")?;
        buf.write_all(&trun_data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_mdat(&mut self, data: &[u8]) -> Result<(), String> {
        let size = 8 + data.len() as u32;
        self.write_box_header(size, b"mdat")?;
        self.buffer.write_all(data).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_box_header(&mut self, size: u32, box_type: &[u8; 4]) -> Result<(), String> {
        // Write size (big-endian)
        self.buffer.push((size >> 24) as u8);
        self.buffer.push((size >> 16) as u8);
        self.buffer.push((size >> 8) as u8);
        self.buffer.push(size as u8);

        // Write box type
        self.buffer.write_all(box_type).map_err(|e| e.to_string())?;

        Ok(())
    }

    fn write_box_header_to_buf(
        &self,
        buf: &mut Vec<u8>,
        size: u32,
        box_type: &[u8; 4],
    ) -> Result<(), String> {
        // Write size (big-endian)
        buf.push((size >> 24) as u8);
        buf.push((size >> 16) as u8);
        buf.push((size >> 8) as u8);
        buf.push(size as u8);

        // Write box type
        buf.write_all(box_type).map_err(|e| e.to_string())?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write as IoWrite;

    #[test]
    fn test_muxer_init() {
        let mut muxer = MuxerState::new(MuxerConfig::default());
        assert!(muxer.init().is_ok());
        assert!(muxer.initialized);

        let fragment = muxer.get_fragment();
        assert!(!fragment.is_empty());

        // Check for ftyp box
        assert_eq!(&fragment[4..8], b"ftyp");
    }

    #[test]
    fn test_muxer_push_video_chunk() {
        let mut muxer = MuxerState::new(MuxerConfig::default());
        muxer.init().unwrap();
        muxer.get_fragment(); // Clear init fragment

        let test_data = vec![0u8; 100];
        assert!(muxer.push_video_chunk(&test_data, 0, true).is_ok());

        let fragment = muxer.get_fragment();
        assert!(!fragment.is_empty());

        // Check for moof box
        assert_eq!(&fragment[4..8], b"moof");
    }

    #[test]
    fn test_muxer_push_audio_chunk() {
        let mut muxer = MuxerState::new(MuxerConfig::default());
        muxer.init().unwrap();
        muxer.get_fragment(); // Clear init fragment

        let test_data = vec![0u8; 50];
        assert!(muxer.push_audio_chunk(&test_data, 0).is_ok());

        let fragment = muxer.get_fragment();
        assert!(!fragment.is_empty());

        // Check for moof box
        assert_eq!(&fragment[4..8], b"moof");
    }

    #[test]
    fn test_generate_complete_fmp4_file() {
        let mut muxer = MuxerState::new(MuxerConfig::default());

        // Initialize
        muxer.init().unwrap();
        let init_segment = muxer.get_fragment();

        // Add some video chunks
        let mut all_data = init_segment.clone();

        for i in 0..5 {
            let test_data = vec![0u8; 100 + i * 10];
            let timestamp = i as u64 * 33333; // ~30fps
            let is_keyframe = i == 0; // First frame is keyframe

            muxer
                .push_video_chunk(&test_data, timestamp, is_keyframe)
                .unwrap();
            all_data.extend(muxer.get_fragment());
        }

        // Write to temporary file for manual inspection
        let output_path = "/tmp/test_output.mp4";
        let mut file = File::create(output_path).unwrap();
        file.write_all(&all_data).unwrap();

        println!("✅ Generated fMP4 file at: {}", output_path);
        println!("📊 File size: {} bytes", all_data.len());
        println!("🔍 Verify with: ffprobe {}", output_path);

        // Verify file structure
        assert!(all_data.len() > 100);
        assert_eq!(&all_data[4..8], b"ftyp"); // First box should be ftyp
    }
}
