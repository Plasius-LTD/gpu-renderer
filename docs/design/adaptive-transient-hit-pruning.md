# Early pruning and transient-hit traffic experiment

Task gpu-renderer#169, Story site#2119, Feature site#2114. The existing remote parent renderer.sampling.adaptivePerPixel.enabled remains off. No public renderer/site API changes or release.

Inspection finds transient RayRecord queues (96-byte shader records), HitRecord scratch (240-byte reflected records, host capacity budgeted at 256 bytes/ray), and 64-byte branch-owned PathNodes, not a persistent cache of previous radiance/rays. Intersect writes each hit/miss to scratch and shade immediately rereads it. Empty continuation arguments use max(1, ceil(count/64)), so dead queues launch guarded workgroups.

Two independently selectable, default-off internal experiments:

1. Zero-empty dispatch: change only the experimental queue-argument writer to ceil(count/64), allowing zero groups. Keep queue swap and all encoded bounce boundaries. No CPU readback to discover emptiness. This removes shader invocations, not the host commands/passes.
2. Fused hit consumer: keep the canonical intersection/material evaluation body and canonical shading body single-sourced; a new experimental entry returns HitRecord locally and immediately shades it without the global hits round-trip or second ray load. Keep the wavefront continuation queues, path ownership, sibling accounting, MIS, sampling, termination and overflow logic unchanged. No multi-bounce in-shader loop or temporal cache/reuse. Default assembled fixed shader bytes must remain identical.

Use existing trace bindings and allocated scratch for comparison, so do not claim allocation savings. Pipeline setup outside measured spans; no new permanent buffers. Prepare/complete/resolve stay unchanged. Independently select ordinary shared, zero-empty only, fused only, and combined; compare all to corrected fixed32 using the same frozen scene/budget/image/timing protocol. Protect correctness rather than assuming fusion wins: register pressure/occupancy/divergence can regress.

Acceptance tests defined before implementation: fixed shader checksum; canonical-body equality; reflection proving no hits/second ray load in fused entry and canonical Ray/Hit/Path ABI; default-disabled no device access; prepared-only dispatch ordering and fixed unchanged; depths 1/4/8; swapped binding parity; failure propagation. Physical tests require same samples, per-pixel counts, HDR identity within existing 1e-5, ray/segment agreement, zero-empty execution, analytic black/emissive/metal/glass with 128 SPP/eight-bounce ceiling and existing nine fault vetoes. Capture independent variants plus combined with warmups/rotated timings; retain failures and all source-bound data. Do not relax quality/confidence thresholds. Run local coverage/LCOV/types/lint/package/Zero-Three and post-push CI, update README/CHANGELOG/new ADR/evidence. Site/noise/full matrix/release qualification remains open. Three.js prohibited; fixed GPU-native rollback only.

