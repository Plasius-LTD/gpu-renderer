# Ordinary BSDF proposal correction — 2 November2026

Task#271 / Feature site#2114. Physical sampling-law probe passes. Four corrected
native1080p uniform32 controls and a native4K production-sampler room control
complete and independently verify. Full image convergence and adaptive
performance remain separate gates.
This is evidence for an estimator defect/correction, not a universal banding fix.

## Independent defect and correction

Actual production WGSL at roughness1, normal incidence, pure GGX must retain
null mass.5. Independent unit-Lambertian importance integration must return1,
including null proposals. The old ordinary sampler returns2.33336 because its
rejected half is replaced with cosine draws while reporting the GGX density.
Coated null handling and pure diffuse controls already return1. Emissive/portal
heuristic controls independently expose unreported proposal distributions.

Remove those continuation heuristics, retain explicit light NEE, and treat
rejected GGX proposals as null events. BSDF values, camera points, collision/
optical transport, count normalization and record/buffer sizes are unchanged.
Corrected CPU production-function quadrature and physical Apple/Metal-3 GPU
probe pass all7 cases: ordinary/coated/rotated GGX, diffuse, emissive metadata
and portal metadata. Physical means1.0000000409–1.0000002226; GGX null fraction
exactly.5, diffuse0. Probe tolerance.0001 and null tolerance.002 were fixed
before measurement. This512-point analytic probe is not a render benchmark.

## Native1080p fixed32 attribution

Preserve the original full room/all references,354,246 triangles, daylight,
clearance.0001m,20 ordinary/2048 optical, denoise/splitting/rough off, independent
transport keys7/19 and fixed camera. Four runs contain265,420,800 completed
camera samples and32 retained lossless HDR chunks. Every tile/sample, actual
flag, probe, source, image hash and cleanup check passes. Same-seed continuation
counts match across the sky flag. Source pins and exact metrics are adjacent.

| Metric | Rejected sampler | Corrected sampler |
| --- | ---: | ---: |
| Uniform independent-pair RGB RMSE |0.2155803968 |0.0815893027 |
| Uniform independent-pair normalized RMSE |0.3371367191 |0.1743485151 |
| Sky-flag energy difference, key7 |-1.590390% |-0.006325% |
| Sky-flag energy difference, key19 |-1.587601% |-0.000481% |
| Key7 primary camera rays |66,355,200 |66,355,200 |
| Key7 continuation segments |148,635,527 |90,228,014 |
| Key7 total path segments |214,990,727 |156,583,214 |

The corrected sky comparisons pass the unchanged1% energy screen. Its
cosine/uniform independent-pair MSE ratio.997769 is negligible descriptive
benefit, not a confidence result; the sky flag stays off. Relative to the rejected
sampler, observed pair MSE falls about86%, but this includes a necessary change
in mean energy (old.56067 versus corrected.41391). Normalized pair RMS difference
falls about48%. Neither measures error against a converged ground truth or
proves matched-quality adaptive improvement. Do not compare performance using
the biased old brightness as reference truth.

Correct null events remove unreported continuation rays; camera-sample count
and actual-SPP normalization stay intact. Ray counters exclude shadow/BVH work;
no GPU/job-time,60Hz or memory gain is claimed from these instrumented captures.

## Provenance, preserved failures and pending gates

Matched native1080p filled/empty glass close-ups also complete and independently
pass native HDR/chunk/tile/count/source/probe/cleanup checks. Each has66,355,200
camera samples and8 HDR chunks. Camera, assets, placement, lighting, materials,
sampling and optical settings match; only water state changes. Filled/empty
total segments192,285,392/182,905,766. Their capture IDs/hashes are adjacent.
Signed row differences are retained as attribution, not a zero-difference
quality requirement for two physically different scenes. Broad bands remain
visible in the filled view; this pair alone cannot classify them as errors or
confirm universal band removal. Fresh known-radiance optical controls and the
preserved independent contrast reference are checked separately.

Fresh known-radiance optical attribution completes all4 existing512x288,
uniform256 controls (150,994,944 camera samples),20 ordinary/2048 optical:
filled, empty, water-IOR1 furnaces and the contrasting pedestal. This is an
analytic transport diagnostic, not a native-resolution performance lane. The
same frozen2% central mean/5% row/5% whole-pixel RGB gates pass. All3 furnace
means are.75000005 against.75; worst RGB error2.34375%, unchanged. Every
optical HDR hash exactly matches the preserved pre-BSDF-correction control.
Core optical/intersection source files are unchanged from that control.

The contrasting-pedestal image is independently reconstructed and compared to
the preserved Cycles CPU reference with actual depth fields1024 (its supported
limit). Reference script hash, linear-image hash, camera, geometry-provider
pin and applied integrator limits are retained. Central row RMSE.00929293,
GPU/reference means.56727204/.56652025. The independent reference reproduces
pedestal contrast through the glass/water; this supports physical contrast bands
in this isolated setup. It does not classify every full-room band or establish
full-room convergence. No optics, lighting or tolerance was changed to hide them.
New batch:`room-reference-2026-11-02T15-25-15-419Z-4fc87eb2-9308-4b56-a519-b140bf8653e4`.

Capture renderer969f6de; later75ae12e changes only batch error reporting.
Corrected assembled default shader SHA256
`b50d988d92d0af5867fc3355cadad89ad8b1affe9c88bf051298df2c8acaf7b4`.
The exact rejected shader and original optical/MIS reconstruction hashes remain
tested. Old and new raw receipts/PNGs/HDR/checkpoints remain under ignored
`output/playwright/eames-environments/`; corrected batch
`room-sky-importance-3a7b7efd-bc30-4655-b5bd-251147f5996a`.

Initial corrected1080p construction failed the unchanged30-second aggregate
bound with `resolveSurfaceRecords` pending28.103s. Preserve failure
`room-reference-2026-11-02T14-11-14-357Z-2c2d46b9-aae5-4248-a2bb-66bda7535980`.
The separate warm batch succeeds; this does not qualify cold startup. Initial
normal4K construction likewise times out (pending28.833s); preserve
`room-reference-2026-11-02T14-36-36-496Z-4f901e89-1e87-463f-bc5b-4a5cb4d502db`.
Its unchanged warm control completes and independently passes native integrity:
`room-reference-2026-11-02T14-39-41-545Z-a88eff47-7f95-4f15-b98b-fb17faad23fb`.
All8,294,400 finite/complete HDR pixels,32 chunks,510 tiles and265,420,800 camera
samples verify. Secondary segments360,922,545; total626,343,345. Scene/camera/
assets/lighting/material/transport identity matches the corrected1080p room.
All preflights/pipelines and cleanup pass. This uses the normal fixed production
sample keys, not the independent-reference specialization; it is not a second
resolution's reference-convergence study. Exact hashes and counts are adjacent.

573 tests pass; lint/types/clean consumer/build/package/all9 Zero-Three checks
pass. Full/production audits0. Combined fresh current-source Node/type/analysis
and byte-identical physical execution:80.70% lines/89.52% branches. Stale
changed-source physical data is rejected; all155 changed JS executables appear
in LCOV, with all10 this-turn executable files actually executed. Older unused
fixture paths stay in the denominator; no coverage exclusion or threshold waiver.
Exact-head75ae12e CI41460204711 passes. ADR0068, design, README and Unreleased
are updated. Three.js is prohibited.

The3% high-SPP reference-convergence screen has not been rerun for this corrected
estimator;32-SPP pair differences cannot substitute for it. Complete
converged references/local and glass-close-up banding checks,
cold-start robustness and matched-quality measurements before resuming adaptive
performance or advancing white-paper claims. No merge/main-CD/release occurred.
