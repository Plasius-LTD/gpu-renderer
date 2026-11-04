# Streamed optical budget qualification — 27 October 2026

Status: **optical controls pass; all six native captures pass integrity.
Adaptive performance remains paused.** Task234 / site Story2291 / Feature2114.
[Machine-readable ledger](streamed-optical-budget-2026-10-27.json).
PR216 remains draft; no merge, package publication, main/CD or release is claimed.

## What changed and what did not

The approved separate optical-interface budget is implemented in GPU-native
transport. Smooth, fully transmitting valid-medium zero-direct chains execute
locally on GPU while retaining every intersection, Fresnel/PDF/IOR factor,
medium transition, roulette draw and physical sampling ordinal. The current
logical node holds their cumulative throughput. Ordinary scattering still
uses the wavefront queue, ordinary depth limit and complete-camera-sample resolve.

The flag remains default off; the interface default remains64. The explicitly
tested allowance is2048 with20 ordinary bounces. This does not make interfaces
free or unlimited. Rough/partial/ordinary surfaces remain ordinary; rough
splitting is rejected. Camera initialization remains air-only.

Production shader SHA256:
`1679475a3e08f26ea681c7bb0ea056c640a315936b91e9dbb8e23c86de23b733`.
Physical captures use renderer `a326c837b6909fdaa53339fb6c59dc2e4baba1c1`;
lighting/shared/site pins are in the ledger. Later c3bd5fa changes only optional
journal addressing/scope and its tests, not production shaders.

See [ADR0067](../adrs/adr-0067-streamed-bounded-optical-chains.md).
Physical events and logical node depths are distinct. Optional journals identify
queue-boundary records and ordinary logical-node depth; they do not pretend to
record every internal interface. Diagnostic pure-chain comparisons use actual
physical ordinals and reject ordinary-scattered histories.

## Retained red controls and attribution

- Exact-primary GPU diagnostics at eb1eabc match all eight original prefixes.
  Six truncated optical64 samples escape at86–235 physical events and recover
  approximately.75 radiance. The earlier one-ULP regenerated-primary failure is
  retained, not accepted by relaxing comparison.
- Streamed64 reproduces all four prototype HDR hashes AND exact physical segment
  totals. The chunked64 rerun repeats that equality. This is a transport/
  accounting equivalence control, not an image pass: filled-glass worst RGB loss
  remains89.062494% at pixel(230,187).
- A first construction-attempt timeout at de68a20 is retained under capture
  `room-reference-2026-10-27T18-07-16-462Z-a9cb6149-bbcb-4ff5-87eb-de96b21d1c10`
  (summary SHA `66e11305a77f068cba90c9b6607491a2e4db97927cb32c2f2bcc62daac8bb038`).
  No stage/tile record was retained for this attempt, so its exact cause is not
  established. Setup-stage observation now preserves pending pipeline stages on
  failure; later successes are not cold-start qualification.
- Unchunked2048 exceeds the30-second operation limit on tile2. Its final sample
  completes validly with no failed node or overflow. Capture
  `room-reference-2026-10-27T18-13-37-975Z-0a93f1dd-c241-4e55-974b-48a0680bedc5`,
  summary SHA `e1bf536896fdc2462a6528ec2def5ff32802afee9d425886abacd0dc795469a7`.
  Do not relabel that capture successful.
- Diagnostic sample chunking reuses the renderer's existing submission-pass
  ceiling. It preserves absolute ordinals, initializes each tier phase once,
  retains sums/counts and spans timestamps over actual work across submissions.
  The30-second operation limit and image tolerances were not increased.

Earlier failed/cancelled optical and native captures remain untouched. The
previous [prototype ledger](optical-interface-budget-2026-10-27.json) remains
historical rejected evidence, not a current allocation contract.

## Optical image gates

The512×288, uniform256-SPP controls are conditional optical diagnostics, **not**
native-resolution or real-time benchmarks. All four finish, retaining150,994,944
camera samples. Independent read-only reconstruction verifies HDR chunks,
provenance, finite pixels, exact counts, cleanup and streamed segment accounting.

Frozen gates remain central mean2%, row5%, plus all-pixel/all-RGB5%; none was
relaxed. At explicit2048, all three furnace variants pass. Their worst RGB error
is2.34375%. Filled central mean error is7.08588e-8 and worst row error7.94729e-8.
This clears the reproduced capped-tail darkening control, not every possible
finite-depth bias or optical geometry.

Capture `room-reference-2026-10-27T18-21-38-565Z-e648b079-4621-4294-b605-e95f929745e4`;
summary SHA `d061d4dfa5a4e0bf38d0623ac60e8019d8eefd711971b4607fb8c24ad8c238bf`.
The ledger retains each HDR and receipt hash.

A new independent Cycles CPU contrast reference applies1024 to all five checked
depth fields, its actual API maximum. It retains independent sampling/roulette
and explicit shared interfaces rather than priority overlap. Linear SHA
`8c561f178465ed991a1cdbc5b40d420761d4482b15b7e3a66597afb8d3388555`;
script SHA `11ccf4d7a137b0d6702a2c4bd27258087f1976a6a6d797371998c1c24d769366`.
Central-row RMSE is.00929293; native/reference means.56727204/.56652025.
This supports pedestal-contrast attribution; it is not a whole-room convergence
oracle or a new error tolerance. Its raw PNG uses a separate display transform.

The constant-radiance image is visually flat. The contrasting pedestal image
still has a band-like reflection/refraction structure, also supported by the
independent reference. The native4K glass retains pedestal/room contrast and
ordinary32-SPP grain. Do not erase physically expected contrast or describe
these images as noiseless/photo-equivalent.

## Full native scene verification

All six full-fidelity captures complete at uniform32 SPP,20 ordinary bounces,
optical2048, corrected fixed-camera transport sampling, denoise/splitting/rough
optics off, bounded+nested transport on, clearance.0001m. Lighting and composition
are unchanged. Filled scenes contain354,246 triangles, all supplied reference
models, authored maps and the original room—not a reduced proxy.

| Resolution | Lane | Camera samples | Actual path segments |
|---|---|---:|---:|
|1920×1080|Empty glass close-up|66,355,200|239,520,035|
|1920×1080|Filled glass close-up|66,355,200|248,960,547|
|1920×1080|Full room|66,355,200|214,996,394|
|3840×2160|Empty glass close-up|265,420,800|957,831,754|
|3840×2160|Filled glass close-up|265,420,800|996,032,923|
|3840×2160|Full room|265,420,800|859,969,186|

Independent verification totals995,328,000 camera samples,3,517,310,839 path
segments,1,935 tiles and120 HDR chunks. It checks every tile's primary/secondary
accounting, queue histogram domain, optical record count, source/PNG/HDR hashes,
finite completed pixels, visibility, cleanup, controls, normal identity and all13
analytic environment-MIS cases. Maximum MIS PDF/mean errors are1.28413e-8 and
3.93412e-6, below the unchanged1e-6/2e-5 limits.

Aggregate `room-qualification-8f89d199-b597-46cc-a86a-c3640766004f/summary.json`;
SHA `901715fabcae5091d94173deb3a2555c85c6ac56c69496c07c475f2b68df1911`.
All six per-lane paths, hashes and descriptive HDR statistics are in the ledger.
Read-only analyses/verifiers remain preserved in the private evidence workspace.

The filled-room mean luminance changes approximately+.00746% at1080p and
+.00701% at4K versus the rejected20-physical-event control. Close-up changes
are larger and expected where additional optical paths return light. Paired
RGB differences are retained as differences, **not** error against ground truth.
Across resolutions the room mean is.56069711/.56069264. This does not establish
full-scene convergence or an adaptive image-quality target.

## Memory, diagnostics and claims boundary

GPU frame/ray/node records remain320/96/64 bytes. The logical node/host queue
capacity stays20; additional optical path-node allocation is zero at both64
and2048. This avoids the rejected prototype's64MiB increment; it is **not** a
total-memory saving versus the pre-budget fixed renderer.

Native filled renderer-buffer descriptors total263,105,556 bytes at1080p and
269,249,556 at4K. Fixture complete-count resources are9,421,084/34,304,284 bytes;
reusable telemetry is43,072 bytes and fixture staging589,824 bytes. Texture
inventories are retained separately. These are application-visible descriptor
totals, not complete process memory, driver-private storage or physical VRAM
residency. No texture/total-memory reduction is inferred from fewer queue passes.

Queue histograms are labelled `queue-iteration`; actual path segments add the
measured internal optical continuations. They are not raw BVH-test/retry counts.
Added diagnostics allocate/update/copy nothing when disabled. The longest
awaited native submission is21.549s, below the unchanged30s bound; this is an
operational diagnostic, emphatically not a frame-rate or performance claim.

Local:539 tests pass;96.53% line/83.43% branch coverage; all63 changed executable
source files appear in LCOV. Lint, types/clean consumer, build, package and
Zero-Three gates pass. Production dependency audit is clear; full development
audit has nine high tooling findings reported without an available fix.
Implementation CI c3bd5fa/run40560221076 succeeds. Documentation follow-up CI is
tracked separately after push.

Adaptive performance remains paused. Still required before promotion/publication:
full-scene reference/convergence and noise targets, cold-start robustness,
appropriate dependency-risk resolution, matched-quality fixed/adaptive baselines
and confidence bounds, rollout/release gates. No60Hz, adaptive speedup, universal
band removal, physical-VRAM reduction, release or white-paper advancement claim
is supported by this checkpoint.
