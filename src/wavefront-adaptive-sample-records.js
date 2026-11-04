// Canonical records shared verbatim by the complete-tree producer and count consumer.
export const ADAPTIVE_CAMERA_SAMPLE_RECORD_WGSL = `struct AdaptiveCameraSample {
  radiance: vec3<f32>,
  sourcePixelId: u32,
  sampleOrdinal: u32,
  status: u32,
  reserved0: u32,
  reserved1: u32,
};`;
export const ADAPTIVE_RESOLVE_CONFIG_RECORD_WGSL = `struct AdaptiveResolveConfig {
  canvasWidth: u32,
  canvasHeight: u32,
  tileX: u32,
  tileY: u32,
  tileWidth: u32,
  tileHeight: u32,
  sampleOrdinal: u32,
  frameValid: u32,
  selectedTier: u32,
  reserved0: u32,
  reserved1: u32,
  reserved2: u32,
};`;
