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
