# Task 212: primary terminal MIS evidence status

Status: local implementation; physical qualification and CI pending.
Base: `4bd223c5431988cc37e364429a3ebd27bb943b36` (Task 210 / draft PR 213).
Assembled shader SHA-256:
`c0a78da83cb60ed59a1bc56ead48d7e258c01ce402836d464c5b713b24c38fcb`.

## Reproduction and scope

Task 210 retained the measured primary-white attenuation of 0.993707537651062
with 32 actual samples. This is rejected baseline evidence, not a success.
The new requirements-first assembled predicate test failed before the fix and
passed afterward. Removing only the new predicate and restoring the two old
guards reproduces the exact prior assembled shader hash. No other transport,
allocation, configuration or scheduling change is included.

The physical fixture retains full float32 RGBA accumulation for each controlled
16x16/two-bounce case, with unit/HDR expected radiance, actual completed counts,
RGB RMSE, maximum absolute error and relative scene-energy drift. All 24 lanes
(four scenes, two resolve modes, 1/32/128 SPP) must pass; the page never substitutes
scheduled sample counts for actual counts. Secondary predicate/heuristic execution
is checked independently. A fixed 120-second deadline and cleanup bound the run.

## Qualification limits

Local validation on Node 24.14.0: 216 tests passed, zero skipped; combined line
coverage 95.40%, branch coverage 75.52%. The only changed runtime source,
`wavefront-shader-kernels.js`, appears in LCOV at 100% lines (string coverage is
not WGSL execution). Lint, types including clean packed consumer, build, package
checks, all nine package Zero-Three checks and dependency audit passed; zero
reported vulnerabilities. No dependency or workflow change was needed.

On 2026-09-13, physical execution was unavailable because the Mac was locked.
The fixture has **not** passed on hardware. No synthetic or historical receipt
substitutes for that run. Self-hosted runners are offline for the user-specified
24-hour maintenance window. CI remains pending; no runner controls are changed.

Eames/noise, nested diffuse scattering, reference convergence, large-resolution
stress, baseline recapture and matched-quality benchmarks remain outstanding.
No adaptive enablement, performance gain, memory reduction, release or paper
advancement is claimed. Three.js remains prohibited.
