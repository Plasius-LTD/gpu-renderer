# ADR 0034: Share camera WGSL with compacted primary generation

- Status: Internal implementation; physical qualification and integration pending
- Date: 2026-09-14
- Task: gpu-renderer#169; Story: plasius-ltd-site#2119; Feature: #2114
- Flag: `renderer.sampling.adaptivePerPixel.enabled` (off)

## Decision

Keep one canonical set of ray/frame records, camera generation, normalization
and sample dimensions. Fixed WGSL assembly imports these definitions without
changing its resulting bytes. The compacted camera stage assembles only its
required definitions and bindings, then calls the same `make_ray` function.
Reflection validates this complete final camera module, including its 96-byte
RayRecord and 320-byte frame config. Tile/control layouts match the reflected
primary worklist ABI; no alternate camera model or RNG is introduced.

Consume validated immutable worklist entries into dense queue slots. Preserve
tile-local ray ID, full-screen pixel ID and absolute within-render sample ordinal.
Keep the configured maximum as the sampling period rather than the selected tier.
Reject failed controls, invalid configuration, insufficient capacity, mismatched
tiles and invalid ordinals before writing camera output; ignore padded slots.
The worklist must remain unmodified after compaction through consumption.

Reuse existing queues and capped immutable configuration buffers. Pipeline creation
is explicit and lazy, and the bridge does not allocate buffers. It is not called
by the fixed dispatcher. A future coordinator must initialize bounce counters and
branch-owned path nodes, run transport and commit one complete camera sample.
Generated rays alone are not completion evidence and must not advance counts.

## Why a camera-only module

The initial full-transport reflection attempt exposed `gpu-shader` 0.1.4's token
validator rejecting the existing legal `_pad0` environment-portal member. We do
not rename padding in a reflection-only copy, weaken validation or change the
fixed shader. Sharing canonical camera code gives the new stage an independently
complete, small interface. This does not qualify reflection of the full transport
module; [gpu-shader#31](https://github.com/Plasius-LTD/gpu-shader/issues/31)
tracks that tooling defect before full-renderer qualification.

## Verification and limits

Require requirements-first unit tests, complete final-camera-module reflection,
fixed shader hash equality and physical bitwise comparisons with dense production
`make_ray` output. Cover all quantised tiers through 256, multiple epochs and
absolute ordinals, mixed/empty/full tiles, padding, failure and configuration vetoes.
Retain source and fixture hashes with observations. GPU compilation and record
identity are not radiance, bounce, image, memory-saving or performance evidence.

No public option, site control, rollout enablement, release or Three.js fallback
is introduced. Three.js remains prohibited. Feature-off uses fixed GPU-native
rendering; production and CI gates may not be bypassed.
