# Independent optical reference and lighting isolation — 27 October 2026

Result: automated controls separate a reproduced pedestal-reflection region from
remaining localized optical loss/noise. **Water image correctness is not cleared;
adaptive performance/publication remains gated.** No production transport,
geometry, material, bounce default or sampler was changed to hide the band.
Task234 remains In progress, PR216 draft/open. All older evidence is preserved.

The [machine ledger](optical-lighting-isolation-2026-10-27.json) records source
pins, retained summaries and reference hashes. PNG/HDR and private models remain
local under `output/playwright/`; no private asset was added to this repository.

## Reproducible diagnostics

The immutable room server serves the opt-in
`tests/fixtures/optical-lighting-isolation.html` action. It runs package-owned
glass/water geometry through the existing canonical GPU pipelines: empty,
filled, index-one water and a contrasting known-radiance pedestal. Constant
environment/terminal radiance is .75; contrast pedestal is .35. Uniform256,
fixed camera/independent transport, bounded+nested on, rough transport/denoise/
splitting off. No transparent-shadow bypass or alternate production renderer.

These512×288 extents isolate optical correctness, **not native1080p/4K performance**.
Each lane completes37,748,736 camera samples; eight20/32-event lanes total
301,989,888. Source20=`787c86c`; source32=`0b9493e`. Runtime `src/` is exactly
identical to the six-lane4195618 native before-controls. The32-event branch uses
the existing engine admission, not an increased room/UI default. GPU telemetry
records8192 count records per full tile (256×32), not a silently clamped20.

Requirements/design and Task234 acceptance preceded implementation. New portable
tests cover geometry forwarding, budget admission, strict depth selection,
furnace/row rejection, corrupt/missing evidence and nonzero verifier failure exit.
Two fixture defects were corrected with regressions: using an inadmissible32-bit
budget array, and reading the canvas after device destruction. Their rejected
attempts remain retained; blank diagnostic PNGs are not valid image controls.
Image-gate failures can continue attribution only after retaining the failed
lane; the final batch and verifier still fail. Count/device/retention failures
abort. No tolerance was widened.

## Independent optics

The installed Blender3.6.1 Cycles CPU renderer initially crashed in the sandbox.
Explicit approval resolved access; no alternate permission bypass was used.
The retained old checker/pedestal input renders filled/empty/index-one controls.
A new portable CLI exports original package geometry from a clean lighting pin;
its geometry/camera/settings exactly match the retained input in a same-process
comparison. There is no platform-specific numeric checksum acceptance test.

`scripts/optical-reference.py` retains full-float EXR, top-left linear float32,
PNG, script/input/output hashes and settings. Background Blender does not expose
its internal Render Result pixel array here; the first PNG-only attempt is
rejected. The corrected exporter reloads retained32-bit EXR, never display PNG,
to obtain linear data. It refuses nonempty output directories.

The reference uses explicit shared-interface relative IORs instead of priority
overlaps. Source geometry is the same public procedural glass/water/pedestal,
but clipping inserts interpolated inner-wall vertices/normals. Independent
sampling/roulette, event-limit semantics and display transforms differ. There
is no private room, floor or checker in the linear constant-radiance controls.
This is optical attribution, not full-room ground truth or a timing comparison.

At256 SPP/20 events the central-glass pedestal-contrast row means are .565036
(native) and .566369 (Cycles), linear row RMSE .012864. Both independently produce
the broad horizontal pedestal-reflection region. Native32 gives .565267 and
row RMSE .012944 against the same20-event reference. **Deleting that region by
changing colours, ignoring glass or smoothing the image is not justified.**
This agreement does not establish every room-band pixel or caustic as correct.

## Remaining failed furnace gates

Acceptance was frozen before physical execution: finite/nonnegative HDR,
alpha1, exact counts, central mean error<=2%, maximum row-mean error<=5%.
The central region is x=.47–.53, y=.34–.72. Every chunk/source/hash is verified
read-only; failed image gates make the verifier exit1.

| Control | Mean20 | Worst row error20 | Mean32 | Worst row error32 |
| --- | ---: | ---: | ---: | ---: |
| Filled | .748103 | 3.992% — pass | .748334 | 3.992% — pass |
| Empty | .747209 | 8.040% — fail | .747242 | 8.040% — fail |
| Index-one | .746866 | 7.905% — fail | .746899 | 7.905% — fail |

The independent empty furnace also fails the frozen row gate at20 events:
mean .748710, worst row5.767%. At64 events it gives mean .749981 and worst
row.0680%. Its worst20-event row176 rises from .706747 to .749804. Thus a finite
optical horizon can create local darkening in this geometry even independently.

Native32 still has row176=.689704 and row RMSE .013856 against independent64.
Simply increasing20 to32 did **not** fix that residual. A progress update which
inferred an empty-lane pass from batch progress was premature; both completed
failed results supersede that inference. Remaining attribution must distinguish
longer internal-reflection tails, roulette variance and any geometric/normal
difference. None is proven the sole cause of the native32 residual.

The code's local-throughput roulette and refractive eta factors deserve a
controlled variance test, not an unmeasured replacement. [PBRT's dielectric
model](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF) and
[path-integrator treatment](https://pbr-book.org/4ed/Light_Transport_I_Surface_Reflection/A_Better_Path_Tracer)
are primary references for reflection/transmission probabilities and eta-aware
roulette. No new roulette policy or extra optical-event budget is implemented
or claimed qualified here.

## Physical room lighting isolation

Normal Playwright automation runs sky-only and sun-only controls using the full
354,246-triangle room/Eames/sofa/spacesuit/glass scene at1920×1080, uniform32,
20 events, same camera/assets/flags, raw HDR and .0001m support clearance. Each
completes66,355,200 samples, all preflights/counts/cleanup;132,710,400 combined.
Both PNGs were inspected. The horizontal feature is visible with sky alone;
sunlight changes its contrast and the pedestal shadows.

The two HDR images recombine to the retained4195618 daylight image with relative
RGB RMSE1.08864705e-7 (frozen attribution threshold1e-5), maximum absolute RGB
error4.29153442e-6. Whole-image RGB sums split27.7023% sky /72.2977% sun. These
are source-attribution fractions, **not** device-time savings, physical energy
accuracy or caustic convergence. Settings, scene, admission and transport flags
match; non-renderer source pins match and renderer runtime src is identical.

Straight shadow visibility still does not implement a refracted light connection
through glass. The sun-only result does not certify missing caustic energy or
justify making dielectric objects non-occluding. No new4K source-isolation,
full-room independent-convergence, adaptive-disabled physical equivalence or
matched-quality speedup pass is inferred. The prior six native1080p/4K captures
remain preserved, not reclassified as a convergence baseline.

## Validation and next gate

498 tests;96.40% line/83.30% branch coverage. All59 changed executable src files
relative to the PR base remain present in combined LCOV. Lint, types/clean packed
consumer, build/package, renderer package Zero-Three source/installed/tarball/SBOM
checks and runtime audit (zero vulnerabilities) pass. Runtime is unchanged by
this diagnostic work. Implementation CI40512370631 at98dd103 succeeds; final
documentation-head CI is recorded on the issue/PR after push. No main/CD release
gate applies, and no local publication, merge or release was performed.

Keep the failed20/32 controls and frozen tolerances. Next: selected successful
histories at row176 and an independently bounded optical-tail/roulette comparison,
followed by any demonstrated correction with numerical/device regressions. A
new event-budget policy needs explicit design/tracked acceptance; do not silently
stop counting interfaces, add ambient light, increase primary SPP or accept
missing samples. Then repeat native1080p/4K image/energy/stability qualification
before adaptive performance work or white-paper improvement claims resume.
Three.js remains prohibited; the offline reference is never a runtime fallback.
