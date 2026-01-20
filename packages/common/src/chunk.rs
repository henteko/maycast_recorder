use serde::{Deserialize, Serialize};
use std::fmt;

/// Unique identifier for a chunk
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ChunkId(pub u64);

impl ChunkId {
    pub fn new(id: u64) -> Self {
        Self(id)
    }

    pub fn next(&self) -> Self {
        Self(self.0 + 1)
    }
}

impl fmt::Display for ChunkId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Metadata for a single chunk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkMetadata {
    /// Unique chunk identifier
    pub chunk_id: ChunkId,

    /// Timestamp in microseconds from session start
    pub timestamp: u64,

    /// Size of the chunk in bytes
    pub size: usize,

    /// BLAKE3 hash of the chunk data
    pub hash: String,

    /// Whether this chunk contains a keyframe
    pub has_keyframe: bool,
}

impl ChunkMetadata {
    pub fn new(
        chunk_id: ChunkId,
        timestamp: u64,
        size: usize,
        hash: String,
        has_keyframe: bool,
    ) -> Self {
        Self {
            chunk_id,
            timestamp,
            size,
            hash,
            has_keyframe,
        }
    }
}
