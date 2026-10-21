# Selected optical histories — 21 October 2026

Task234 / Story site2291 / Feature site2114. This adds evidence; it does not
replace the [six-lane rim follow-up](room-qualification-rim-followup-2026-10-21.md)
or any retained failures. [Source-bound ledger](selected-optical-paths-2026-10-21.json).

Normal Playwright dropdown access now succeeds. The frozen eight selections run
automatically through ordinary controls at 1080p, uniform32, depth20, filled-glass
close-up, denoise/splitting off, bounded+nested on, rough off and 0.0001 m clearance.
All 66,355,200 camera samples, eight HDR chunks, all preflights and cleanup pass.
All eight original geometry and post-surface journals validate identity, finite
radiance and terminal accounting. HDR **and PNG** exactly match the frozen
non-diagnostic control. The journal replay does not change this accepted image.
Diagnostic-inclusive timing is excluded from performance claims.

## What the histories establish

The sampled white-band region includes rays travelling air → glass → water →
glass → air and reaching the grey pedestal. A lower selected ray enters the
glass base, internally reflects, returns through water and escapes to environment.
Other selected branches reflect at the front glass or terminate by compensated
roulette. Five terminate by roulette and three at environment; none reaches
the20-interaction ceiling. This is evidence against attributing these eight
samples to insufficient maximum depth, not a proof that all paths avoid it.

These mechanisms agree qualitatively with the retained independent analytic
cylinder control, but eight histories are not a convergence/energy reference.
They do not establish that the entire band is physically correct, nor justify
removing reflection/refraction or changing IOR/exposure to hide it. The broad
band remains visible; adaptive performance stays paused.

## Separate defect found and corrected in packing

No-map glass/water/pedestal shading normals have tangent components approximately
1/255. Every packing path set normal strength one when the map was absent, so
the RGBA8 fallback [128,128,255] tilted an otherwise authored normal:128/255 is
not0.5. The new portable absent-map test fails first with all four inspected
packing values1 rather than0. Preserve this physical control unchanged.

Set the existing strength to zero for omitted/null maps in CPU triangles, GPU
materials and GPU mesh sources. Preserve real image bytes and their default,
authored and explicit-zero scales. Do not reinterpret authored byte128 as exact
zero. No shader/ABI/resource/sampling/BSDF/PDF/MIS/medium contract changes.
Extend assembled material preflight with analytic missing/null/real/zero-map
normal controls. The normal correction is not asserted to remove the band;
its new-source native scene and independent image qualification remain required.

Acceptance was recorded before implementation in Task234 comment6316459126 and
the design/ADR0063 follow-up. Task/PR stay open; Three.js remains prohibited.
No adaptive gain, lower memory, release, local publication or white-paper success
is claimed. Exact-head CI and new physical results must be recorded separately.

Local correction validation: 483 tests pass, 96.45% overall line/83.27% branch
coverage. All 59 executable src files changed relative to the PR base appear in
combined LCOV; the changed packing module has 98.72% line coverage. Lint, types,
clean packed consumer, build, public-package check, all nine Zero-Three gates
and runtime audit (zero vulnerabilities) pass. The physical normal preflight
and new-source native images are not implied by these software results.

## Physical correction control

Correction `d53ced33554cab6d669d2d8104ca15cfcf86add2` passes all CI jobs in
run39603988783. Its matched 1080p uniform32/depth20 filled close-up completes all
66,355,200 samples, all preflights, eight selected journals and cleanup. Receipt
`eed607287bdb8de2f819fc83994c87cb89995c0d6504d865d1d3937e78c24235`, capture
`room-reference-2026-10-21T12-59-27-734Z-7569488f-3b47-403f-ab7d-8432737f49da`.
New HDR `e050e56eb765a97471b6502bf1c7268aadf53c35b7db127644bbed01183bf88f`;
PNG `688aae9a67549de301d04055185da8ead46ae32c6cd980bd41c1afd87bb370c3`.
All eight chunks and native pixels independently verify. Original controls remain.

The four assembled normal cases pass with maximum component error
`2.579719238227085e-8` against the frozen `1e-6` tolerance: omitted/null/zero-scale
maps give exactly [0,0,1], and the real map retains its analytic perturbation.
Actual glass-wall journal normals now have y=0; base normals have y=±1 rather
than the quantised fallback tilt. This confirms the specific correction on the
physical device. **The broad band remains visible.** A complete new-source
six-lane matrix is running; this one control is not its completion.

## Lighting support audit — not a new rendering change

ADR0021 intentionally models procedural direct sun as a shadow-tested directional
light. At this source, `surface_procedural_sun_contribution` tests a straight
visibility ray and returns zero on any admitted mesh occluder, including glass.
The terminal procedural environment has a finite power-192 glow, not that delta
directional-light contribution. There is no refracted connection for the explicit
directional sun in these functions. A finite glow is not evidence that every
delta-light/specular-chain contribution is sampled.

This distinction follows the delta-direction light measure described in
[PBRT's distant-light contract](https://www.pbr-book.org/4ed/Light_Sources/Distant_Lights).
It is a source-level support limitation and a plausible contributor to the dark
pedestal region, **not a measured attribution of the entire band**. Ordinary
straight visibility rejecting a refractive blocker is not itself proof that the
collision should be ignored. Do not make glass non-shadowing or apply straight
alpha transparency as a correction for refracted illumination.

Remaining isolation should compare matched sun/sky contributions and convergence
before changing lighting. Coherent angular-source evaluation/sampling is already
tracked in gpu-lighting#97 / site Story2169 / Feature2166; general caustic
qualification is not supplied by the current eight-path control. Any expanded
lighting implementation needs its own requirements, independent tests and fixed
environment baseline before adaptive comparisons. No speculative sun, BSDF or
visibility change is included here.

## Separate secondary environment MIS counterexample

The source's strict procedural direct estimator samples either uniform hemisphere
or cosine hemisphere, but terminal environment MIS evaluates its no-importance
competitor with `uniform_sphere_pdf()`. The light-class selection probability
must also be represented when emissive lights compete. The previous surface's
normal/distribution cannot generally be recovered from miss direction alone.
This is separate from primary-camera MIS, which already bypasses that weighting.

A retained read-only analytic Lambertian/constant-sky control uses the exact
scalar power-heuristic floor1e-6 and frozen source hashes. Mismatched uniform
hemisphere/sphere gives mean1.2252836441; cosine hemisphere/sphere gives
1.3229229323 for a unit target. Matching PDFs gives1 and0.999997532599: the latter
matches the independent closed form `1-pi²*1e-6/4` for the existing tiny floor.
The earlier ideal-heuristic prototype is retained but excluded as source-exact
evidence. These are scalar contract counterexamples, not whole-integrator,
physical-image or full-band measurements.

The [machine audit](environment-mis-pdf-audit-2026-10-21.json) retains source hashes,
quadrature counts, distributions, integral, scalar floor and known limitations.

No speculative runtime MIS change is made while retaining the matched d53ced3
matrix. Before correction, reproduce the defect with failing portable/assembled
tests; retain the actual previous-vertex strategy/PDF/support/class probability,
primary/delta/no-competing behavior, importance/emissive mixtures, split and
staged/fused identity and disabled compatibility. Strict direct sampling uses
sky only while terminal environment also contains finite glow, so blindly
substituting a hemisphere constant for the complete miss is insufficient.
Separate competing sky, unsampled glow and explicit directional sunlight; prove
the full estimator's furnace/energy means on GPU and in native scenes. Acceptance
and source hashes are retained on Task234. This unresolved defect independently
prevents image-correctness signoff and adaptive-performance resumption.
