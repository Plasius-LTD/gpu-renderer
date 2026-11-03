# Full-fidelity GPU performance priorities

Feature [site#2114](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2114).
Tracked follow-on [Story2362](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2362)
has renderer Tasks [282](https://github.com/Plasius-LTD/gpu-renderer/issues/282)
(optical work), [283](https://github.com/Plasius-LTD/gpu-renderer/issues/283)
(any-hit), [284](https://github.com/Plasius-LTD/gpu-renderer/issues/284)
(storage), [285](https://github.com/Plasius-LTD/gpu-renderer/issues/285)
(material proposals) and site [2363](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2363)
(rollout controls). They are unassigned/Backlog; no runtime implementation has
started. The host screen remains active under renderer Task169.
This is a measurement-led follow-on design, not an implemented optimisation or
performance prediction. Three.js is permanently prohibited, including rollback.

## Evidence available on 3 November 2026

The user provisionally accepts the existing convergence for experiments. The
failed frozen image screens and their evidence remain unchanged. The host-only
experiment in [the protocol](native-host-performance.md) preserves scene,
sampling, transport and GPU commands. Its captured renderer is
`7066b5eca6615c3f1977e0b1653c47039241880e`.

In the native 1080p full filled room, the legacy/template median completed job
times are 66,129.2/66,321.7 ms across three alternating timed pairs. This does
not demonstrate a whole-job speedup. Separate diagnostic images and all
31,652,362 path segments match exactly. These are short exploratory measurements,
not confidence, real-time, image-convergence or release qualification.

The legacy diagnostic sums to 64,635.47 ms of timestamped tile GPU work;
configuration packing takes 15.5 ms exclusive host elapsed and command encoding
154.6 ms. V8 coverage/profile overhead affects the diagnostic host intervals;
they are not the uninstrumented timing frames or CPU utilisation. GPU timestamps
describe the instrumented workload and exclude full-frame presentation. Native
4K measurements were pending at this prioritisation checkpoint. The subsequently
completed batch verifies exact1080p/4K identity with no meaningful job speed gain;
see [the retained measurements](../evidence/native-host-performance-2026-11-03.md).

Tiles 96, 81, 97 and 82 account for 29,255.99 ms (45.26%) of that diagnostic GPU
time, 3,528,385 segments (11.15% of segments), and 697,753 of 721,428 extra optical
segments (96.72%). Spatial association identifies a hotspot, not its precise
microarchitectural cause. Ordinary segments, shadows and surface work also occur
in those tiles. Do not attribute all their time to optical interfaces.

The current scene has 354,246 prepared 576-byte triangle records: 204,045,696
application-visible buffer bytes, about 77.55% of its 263,105,556 renderer-buffer
inventory. This describes the current allocation, not achieved future savings
or exact physical VRAM residency. Texture and other memory classes are separate.

## Independent candidates, in priority order

1. **Optical workload isolation.** Measure smooth-interface chain lengths and
   tile costs first. Investigate bounded, GPU-compacted optical work separated
   from ordinary intersections, or bounded continuation slices that retain the
   same ray/hit state. The current streamed chain is inside the intersection
   invocation. Long chains may increase divergence/register pressure, but those
   causes have not been measured. Preserve the 20 ordinary/2048 optical policy,
   per-event sample dimensions, medium transitions, arithmetic order, roulette,
   complete-camera-sample accounting and bounded storage. Do not discard tails,
   lower limits or approximate glass to obtain a timing improvement.
2. **Shadow any-hit traversal.** The existing
   `scene_ray_visibility_blocked` calls closest-hit `intersect_bvh` and then
   returns a boolean. Test an early-return traversal using the same triangle
   admission, distance, sidedness and medium rules. Do not change what counts
   as an occluder or conflate this with new transparent-shadow transport.
   First prove boolean identity over adversarial scenes and real rays; retain
   exact full-scene HDR/counts before measuring speed. Benefit is unmeasured.
3. **Geometry/material storage separation.** Evaluate a compact hot geometric
   record and separately indexed immutable material/texture descriptors instead
   of repeating all material fields per triangle. Reuse existing material
   ownership and final-WGSL reflection. Produce the proposed ABI and allocation
   inventory before implementation. All UV sets, normal maps, sheen, clearcoat,
   transmission, attenuation and medium metadata remain intact. No numerical
   memory saving or cache benefit is promised before descriptor/device evidence.
4. **More useful samples per ray.** Qualify material-energy-dependent lobe
   proposals while preserving the physical BSDF and consistent sampling/PDF/MIS
   with nonzero support. The retained actual-WGSL isolated rough diffuse control
   found approximately95.09% lower continuation variance with a95%-diffuse
   proposal, but this is not a suitable global constant or demonstrated room
   improvement. Fewer nulls can mean more continuing rays and worse fixed-SPP
   time. Measure material integrals, whole-scene error and matched-quality GPU
   time across independent transport keys before accepting a policy; do not
   alter material energy, optional stopping or accepted image thresholds. See
   [the isolated evidence](../evidence/ordinary-proposal-variance-2026-11-02.md).

BVH key normalisation and near-first child ordering are additional hypotheses,
not part of the first candidates. Measure node/triangle/visibility work before
changing the tree; preserve nearest-hit tie and collision contracts.

## Controls, tests and delivery

Each implemented candidate needs its own registered, default-off remote flag
under the existing renderer feature governance, with independently selectable
local A/B controls. The adaptive parent and environment rollout stay independent.
Register controls and repository-owned Tasks before runtime implementation;
do not claim these planned flags currently exist. No new budget governor.

Require requirements-first unit, integration, final assembled WGSL/reflection,
physical device and native HDR identity/regression tests, including empty/filled
glass, thin geometry, sidedness/occupied exits, invalid media, every material map,
queue overflow, cancellation, timeout, device loss and cleanup. Preserve source
pins, losses/nulls/roulette, camera samples, secondary/optical segments, timestamps,
submission/dispatch counts, host intervals, allocation classes and all failures.

Run mechanisms individually, then useful pairs and the combination at 1080p
and 4K with the same full assets, quality, samples and depth. Separate profiling
from warm alternating timing frames. Retain all paired observations; require the
approved confidence gate before a matched-quality speed claim. No tiny-scene,
reduced-fidelity, cold-to-warm or diagnostic-to-uninstrumented comparison.

README, Unreleased CHANGELOG, ADR and reproducible evidence must accompany each
change. Full tests, >=80% combined coverage with changed sources in LCOV, lint,
types, package/Zero-Three gates and exact-head post-push CI remain required.
Approved main/CD gates apply to release-bearing work. Rollback disables the
individual GPU-native optimisation; it cannot restore Three.js. No local publish,
production activation or white-paper performance promotion is authorised by
this exploratory design alone.
