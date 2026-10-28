# Native room convergence prequalification

Task gpu-renderer#234, Story site#2291, Feature site#2114. This is the next
correctness prerequisite, not permission to resume adaptive performance work.
The parent `renderer.sampling.adaptivePerPixel.enabled` remains default off.

## Requirements frozen before measurement — 28 October 2026

Reuse the existing full-fidelity room capture, GPU-native transport, complete
sample counts, source/asset receipts and gpu-lighting linear-image metrics. Do
not build another renderer, quality governor or image estimator. Preserve every
earlier capture, including rejected controls. Three.js is prohibited, including
tools and rollback.

For each native resolution (1920x1080 and 3840x2160), capture the filled-glass
room overview at uniform32, uniform128 and uniform256 SPP, independently for
seeds7 and19. Seeds vary transport, not scene state. Every pixel completes its
requested budget. Use20 ordinary bounces plus the explicitly tested2048 optical
interfaces, corrected fixed-camera sampling, all reference models, original
daylight, authored materials, clearance0.0001m, no denoising/splitting/rough
optics, no frame/motion budget reductions or temporal reuse. These are diagnostic
settings, not new production defaults. The selected native resolution is never
silently replaced with a thumbnail. Default automation covers both resolutions;
an explicit single-resolution batch is labelled partial, never full qualification.

Retain sequential lane receipts, PNGs, losslessly encoded linear HDR, source and
asset hashes, camera, scene/material/transport identities, actual seed/counts,
per-tile queue/optical evidence, failures, cleanup and pipeline setup observation.
Stop on cancellation, capture failure or changed controls/provenance. Never
mark retained captures converged merely because capture integrity passed.

## Analysis and claims boundary

Reuse gpu-lighting's `compareLinearImages`, not a tone-mapped PNG comparison.
Validate the exact capture plan and scene/camera/assets/transport before metrics.
Reject missing, duplicate, reordered, corrupt, non-finite, incomplete, upscaled,
wrong-SPP/seed, fallback-adapter or changed-source evidence. Verify every HDR
chunk hash, contiguous extent, full-image hash and completed-pixel alpha. Read
evidence only; write a separate report, never modify input captures.

The existing paired-probe convergence screen remains normalized RGB RMSE<=0.03
(reference RMS with1e-6 floor). Apply it both between128 and256 for each seed
and between independent256-SPP seeds. Also require absolute relative energy
drift<=0.01 for these three reference comparisons. These are frozen conservative
prequalification screens inherited from the earlier diagnostic protocol, not a
new production tolerance or proof of unbiasedness. A failure stays red; do not
raise SPP limits or relax thresholds after seeing the result.

Report each32-SPP seed against the opposite256-SPP seed: RGB/normalized RMSE,
p95/p99/max local channel error, mean/max luminance error and energy drift.
Report row-mean differences for spatial structure. This does not equate noise
with a transport bug, prove the absence of all banding, or establish a production
perceptual tolerance. No adaptive measurement is admitted by this screen alone;
material/silhouette/local/temporal review and the approved benchmark matrix remain.

Tests precede implementation: plan completeness and bounded settings; actual
seed forwarding; source/asset/camera/transport identity; failure/cancellation and
restoration; HDR corruption and missing evidence; reference-gate failure that
cannot become success; known synthetic RGB/energy/row differences. Tests must be
portable, without Mac-specific checksums. Run coverage/lint/types/build/package/
Zero-Three and exact-head CI. No local publication, merge or main/CD claim.

## Cost, memory and rollback

High-SPP native captures are expensive correctness jobs, not60Hz measurements.
Reuse tile-bounded queues, sample submission chunks and unchanged timeouts.
Analysis holds at most a comparison pair plus compressed input and quantile
scratch, and runs on CPU offline; it is not renderer frame cost or VRAM.
No runtime shader, sampler, material transport or production API changes are
required. Cancel stops after pending bounded GPU work and retains completed
lanes; disable the existing experiment flags for GPU-native rollback.

## Narrow developer dependency correction

The remaining nine high tooling audit findings trace to the repository override
forcing brace-expansion5.0.9. Registry/advisory inspection before implementation
confirms patched5.0.12 is available and satisfies minimatch's existing
brace-expansion5.x requirement. `fixAvailable:false` in npm's audit response does not
mean no patched package exists when an override blocks resolution. Replace only
that override with `^5.0.12` and regenerate the affected lock node with npm. Do
not churn unrelated dependencies, renderer sources or qualification inputs.
Require the full and production audits to pass, ordinary expansion/matching
smoke tests, full local quality/Zero-Three gates and post-push CI. Captures remain
pinned to their immutable pre-tooling-change source; this is not an image fix.

Primary patched-version references:
[nested recursion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7)
and [rewrite-complexity advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).

## Rejected replication and corrected reference experiment

The first two completed32-SPP lanes at6e89e32 have different recorded frame
indices7/19 but the same HDR hash. Source review confirms stablePatternWgsl(true)
deliberately keys transport with frame zero. Preserve them as duplicate stable
controls, **not independent replications**. The batch was cancelled before4K.
Do not alter that intentional production stability to make the protocol pass.

Before another expensive batch, add a fixture-only, explicitly named
`frame-indexed-transport-v1` reference specialization. Reuse the exact existing
fixed-pattern WGSL, replacing only its transport mix_seed zero frame key with
the existing config.frameIndex. Camera dimension1, pixel/sample/bounce/dimension
keys, distributions, PDFs, transport and sample counts remain unchanged. The
regular renderer and ordinary capture keep byte-identical stable shaders.
Apply the specialization coherently at shader-module construction, retaining
source hashes and the actual seed. A portable CPU oracle reuses
progressiveSampleWords; an assembled physical probe must compare exact u32
draws for multiple seeds, pixels, dimensions, high sample/bounce ordinals and
prove transport differences plus unchanged camera words. Require that probe and
specialization evidence before admitting any convergence lane; reject duplicate
same-budget full-room images. Existing unqualified receipts must fail admission.
Keep all image thresholds unchanged. This experiment is a reference estimator
for uncertainty, not a new production sampler or adaptive performance result.
