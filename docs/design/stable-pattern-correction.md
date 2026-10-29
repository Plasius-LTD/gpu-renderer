# Stable-pattern defect correction

Current direction: [fast-pattern restoration](fast-pattern-restoration.md)
supersedes stable-pattern as the working experimental lane. The correction
protocol and retained measurements remain as comparison history, not a
production or overall quality/performance success.

Tasks gpu-renderer#169 / gpu-lighting#87; Stories site#2119/#2125; Feature site#2114.
The failed fixed-pattern capture remains immutable comparison evidence.

## Design and acceptance, frozen before capture

Retain centre-first fixed camera locations. Replace spatially shared lighting
choices with deterministic pixel/event/bounce/component-keyed permutations of
the existing Sobol pair. Keys exclude frame, seed, ordinal and selected budget.
Use the fast prefix-preserving bit permutation described by PBRT, not full
nested Owen scrambling or the expensive 24-level hash loop. This is a pixel-local pair sampler with independently keyed
events, NOT a full high-dimensional Sobol generator or a guarantee of unbiased
individual pixels. All 1D selectors use their own event key. No new allocations,
passes, caches or changes to BSDF/PDF/MIS, transport, count resolve or budgets.

New remote snapshot flag renderer.sampling.stablePattern.enabled defaults off,
mutually exclusive with existing sampler flags. It selects a dedicated shader
at creation. Keep the failed fixedPattern experiment intact. An internal
stable-camera-random control shares the fixed camera pattern but uses independent
lighting keyed with frame zero, providing a fixed-camera comparison control.
The control also uses the new dedicated 1D selectors; it is not a pure camera-only
change from the historical independent-random sampler. Do not attribute isolated
camera costs from this comparison.
This deliberately relaxes identical lighting points across pixels, not temporal
stability. 1-SPP camera stays at pixel centre. No production primary/default
switch is permitted until quality and performance qualification pass.

Tests first: zero/frame independence, distinct spatial/event/bounce keys,
camera centre, absolute ordinal/budget independence, dyadic pair occupancy,
analytic 1D/2D/cross-event integrals over independent pixels, half-open bounds,
CPU/GPU integer parity including high ordinals, flag conflict/off/source identity,
all pipeline families, public types, identical allocations. Invalid mode fails
closed. No tolerance relaxation, exposure scaling or denoising workaround.

Native original Eames 1080p then 4K, four bounces, denoise off, ceiling 32,
same 5/10/15/20/25/25 percent radial areas. Separate timing-only warmup and
three rotated rounds from diagnostic HDR/count/ray/GPU/CPU evidence. Compare
independent-random, old fixed-pattern, stable-camera-random and stable-pattern.
Common reference: three independent-random fixed32 frames seeds 7/19/43
(96 samples, not certified converged). Check uniform32 identity, each actual
count, seed 7/19 repeatability for stable candidates. Require <=1% absolute
global and each reduced-ring energy drift as the existing brightness screen;
report RMSE/p99/local/silhouette errors and visually inspect images, never
substitute regional mean correctness for full quality. Preserve all failures.
Retain source/asset/device/browser provenance, native PNGs, float HDR, timings,
allocation inventories and raw GPU queries. No 60 Hz or matched-quality claim
from short measurements or unconverged references. A corrected candidate may
become the primary experimental optimization lane, not the production default.

UI QA: resolution selector, run/cancel/restart, progress and visible failures;
inspect initial layout and completed native images. Two negative checks cover
invalid sampler and mutually exclusive flags. Full coverage/changed-source
LCOV, lint/types/build/package/Zero-Three, README/CHANGELOG, ADR, push and CI.
Rollback disables sampler flags and recreates the unchanged GPU-native path.
Three.js is prohibited without exception or fallback. No local publishing.

Reference: https://pbr-book.org/4ed/Sampling_and_Reconstruction/Sobol_Samplers

## Six-bounce native reference capture — 28 September 2026

User approves retaining corrected stable-pattern as the experimental path despite current performance and requests a native 4K adaptive six-bounce image for reference/promotion. Parent Feature site#2114, Stories site#2119/#2125, Tasks renderer#169 and lighting#87 apply; stablePattern remains the default-off named rollout flag. No production promotion, merge, publishing or performance claim.

Reuse the canonical source Eames loader, room, camera, textures, existing native adaptive runner and exact circular 32/16/8/4/2/1 budgets (5.95 mean). Denoise off, sequence ceiling32, maximum depth6, no exposure/transport changes, no resizing or retouching. Extend lighting-owned fidelity admission with explicit expected depth4 or6; retain default4 and reject mismatches/invalid depths. Renderer loader forwards that expectation, with a separate reference-only UI rather than modifying four-bounce benchmark history.

Acceptance: tests first for explicit6/default4/mismatch/invalid-depth admission and capture settings/count/error validation; physical non-fallback adapter, native3840x2160 PNG, actual budget counts, no GPU validation/overflow/loss, repeat identical static frame with different seed. Retain PNG, full HDR, settings, source/asset hashes and diagnostic receipt; inspect the native image before signoff. UI Run/Stop/restart, no overlapping runs, visible settings/progress/errors and responsive layout. Test mismatched count/depth as negative cases. This is a visual reference, not a converged-reference or six-bounce performance qualification.

Update README/CHANGELOG and reference notes. Reuse existing ADRs; no new architecture. Run relevant tests, coverage, lint/types/package/Zero-Three gates and post-push CI. Caption must disclose adaptive budget, bounce ceiling and denoise state without implying real-time performance. Asset attribution/licence must be confirmed before external publication if not recorded. Three.js is prohibited, including fallback.
