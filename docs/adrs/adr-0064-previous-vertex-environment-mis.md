# ADR 0064: Previous-vertex environment MIS density

Status: Accepted for implementation; native image qualification pending.
Date: 2026-10-21. Task gpu-renderer#234, Story site#2291, Feature site#2114.

## Context

The retained [MIS audit](../evidence/environment-mis-pdf-audit-2026-10-21.json)
shows strict procedural NEE draws from a surface hemisphere but terminal misses
use a full-sphere PDF, omitting light-class selection and the previous normal.
A constant-sky Lambertian counterexample overestimates energy by about 22.5%
(uniform) or 32.3% (cosine); these are analytic controls, not room error figures.
Strict sky NEE also does not sample finite sun glow. Weighting the entire miss
against the sky proposal suppresses a source with no competing estimator.

## Decision

Store the previous surface's competing environment solid-angle density in
`RayRecord.direction.w`. That component was previously written as zero and not
read by traversal; xyz remains the geometric direction. Keep throughput.w as the
BSDF PDF. Camera and visibility rays retain zero; delta/no-competing continuations
and surfaces without NEE store zero. Each ordinary or rough split continuation
computes its own density using its generating surface, including the oriented
optical normal for eligible partial/rough reflection. Smooth optical siblings
remain delta and receive no terminal MIS. Staged and fused kernels share the body.

Share proposal selection/PDF evaluation with direct lighting. Include actual
hemisphere support, cosine/uniform mode, texture importance and environment class
selection: mixed .5, no emissives 1, deterministic two estimators 1, emissive-only
source-stable 0. A map without importance data samples full-sphere map radiance,
not procedural sky. In strict procedural mode weight only the sampled sky at
termination; retain full unsampled finite glow and portal-blocked ambient fallback.
Apply the same portal scaling/gating to direct sky. Explicit directional sunlight
remains a separate delta source. Do not simulate refracted NEE or bypass optical
occlusion by treating glass as transparent to straight visibility rays.

This is a consistency correction under existing remote controls, not another
performance mode. No new allocation, record size/offset, dispatch, readback,
sampling sequence, BSDF/PDF, IOR, collision, count, roulette or bounce policy changes.
It deliberately corrects affected fixed and adaptive radiance, rather than keeping
the rejected estimator as an optional runtime fallback. Adaptive-disabled scheduling
and allocation behavior remain unchanged. Three.js is permanently prohibited.

## Validation and limits

Portable tests execute canonical WGSL functions and preserve the rejected scalar
control. Final assembled GPU preflight tests 13 proposal/material/portal modes,
direct/continuation PDF parity, hemisphere support, rotated normals, primary,
delta/no-NEE and partial optical paths, plus a sky+unsampled-source furnace.
Frozen tolerances: PDF/component 1e-6, mean 2e-5. The existing heuristic denominator
floor (1e-6) remains; its tiny low-density loss is included in the analytic bounds,
not silently removed or confused with the larger proposal mismatch.

Require automatic empty/filled close-up and full-room uniform32/depth20 captures
at native1080p/4K; independently verify HDR chunks, counts, provenance, cleanup and
review banding. Completion is not convergence or energy certification of the room,
nor 256-SPP, feature-off physical equivalence, caustic or performance qualification.
Preserve all before/intermediate/failed captures. Keep adaptive performance and
publication claims paused until image correctness gates pass. Additional shader
arithmetic cost is unmeasured; unchanged allocations are not exact physical VRAM.
Full tests/coverage/changed-source LCOV, lint/types/package/Zero-Three and exact-head
CI remain required; no unauthorized merge/release or local package publication.
