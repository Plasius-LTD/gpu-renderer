# ADR 0044: Native prescribed adaptive tracing

Status: accepted for internal diagnostic implementation, not production rollout.
Date: 2026-09-26. Task #169, Story site#2119, Feature site#2114.

## Context

Single-tile timings cannot answer the user's 1080p/4K adaptive question. The
requested concentric area shares imply 5.95 SPP, but only real full-frame work
and completed-count readback can validate that reduction and its cost.

## Decision

Lighting owns the prescribed radial map/protocol. Add an internal opt-in tile
plan and generic full-screen tile output/count-gather, reusing existing shared
rounds, canonical FrameConfig/tone map and optional immediate-hit transport.
Cache immutable budget/plan preparation, report setup cost, upload fresh zero-count
budget words each render. No radiance, ray or completed-count reuse across frames.
Select ranges only from tiers present in each tile, preserving the global 32-SPP
sequence period and absolute within-frame sample ordinals. Reuse one tile's
worklist/path storage; full-screen pixel state remains under the existing cap.

Separate timing-only frames (all tiles plus canonical presentation) from CPU/GPU/
actual-count/HDR diagnostics. Gather state in tile order using full-screen source
addresses, including partial tiles. Reuse bounded telemetry/readback and allocation
owners, fail on incomplete/invalid samples, keep failures and source provenance.

The public renderer remains unchanged; existing single-tile diagnostics retain
their original API and behaviour. Internal native tracing requires explicit
options; parent `renderer.sampling.adaptivePerPixel.enabled` remains off. The
real-time target applies to adaptive, fixed32 is a control. Three.js is prohibited
and cannot be rollback. No matched-quality/publication or physical VRAM claim.

## Consequences

Diagnostics add separately reported staging/readback and can perturb timing, so
their wall times are not headline performance. Prescribed one-SPP regions do not
qualify material/edge/environment safeguards. Production integration, converged
references, sustained display performance, CI and release gates remain open.
