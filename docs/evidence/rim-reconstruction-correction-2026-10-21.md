# Rim reconstruction correction — 21 October 2026

Task gpu-renderer#234 / site Story#2291 / Feature#2114. The user approved fixing
the [retained 4K failure](room-qualification-2026-10-21.md) and automatically
rerunning native 1080p/4K qualification. All original receipts, private assets,
lossless HDR/PNG and rejected attempts remain preserved. Adaptive performance
work stays paused; no band-removal or quality/performance claim follows from
software tests alone.

## Requirement and rejected result

The [frozen original parametric case](room-rim-reconstruction-2026-10-21.json)
has positive barycentric weights, but the former reconstruction places its point
outside the admitted rim: projected first weight -0.000006256196961396436.
Independent geometry from the original ray point finds the nearby wall exit;
the stored point misses it. The new requirements-first regression fails on the
previous runtime, before implementation. This is an empty-glass bounce-1 defect,
not missing SPP, exhausted bounce depth or proof of every visible band's cause.

## Correction and limits

Compute `(v1-v0)*b1 + (v2-v0)*b2` before adding `v0` once. An explicit fma forms
the small edge sum; the last large addition avoids the extra rounding between
edge contributions. This follows the reconstruction ordering discussed in
[NVIDIA's hit-point analysis](https://developer.nvidia.com/blog/solving-self-intersection-artifacts-in-directx-raytracing/),
not its hardware-specific constants or HLSL precise contract. Existing projected
normal-error estimates, representable interior-bound treatment, strict hit/cursor
tests, medium state, count gates, BSDF, sampling, ABI and allocation sizes stay
unchanged. No triangle tolerance or arbitrary scene offset is added.

The exact frozen barycentrics and 36 sign/axis/vertex-order variants retain
positive projected interior weights and a distinct next exit with both fused
and explicitly non-fused edge interpolation. Existing edge/vertex, planar-axis,
bottom-corner, origin, ordering and ordinary disabled collision tests remain.
The 28th assembled dielectric device case checks both a newly intersected camera
ray and the captured barycentrics through canonical reconstruction, origin and
inner-wall collision. Rejected base-first reconstruction and injected lost/wrong
exits fail the probe. No claim covers arbitrary-scale indistinguishable geometry
or unmeasured devices/compiler arithmetic.

## Qualification status

Local full suite: 463 tests pass, 96.42% lines / 83.20% branches; the sole changed
runtime module is present in LCOV at 100%. Lint, types/clean packed consumer,
build, package integrity, all nine Zero-Three gates and runtime audit (zero
vulnerabilities) pass. The canonical shader SHA256 is
`0870dd03fd8f7561a13da66a00e8be84c9f168994d392215edaea093d950478a`.
Five existing whole-shader fingerprints are deliberately re-pinned after the
independent functional regressions; their behavioral checks remain unchanged.

Immutable source pin, exact-head CI and physical rerun results
will be recorded after execution. Until then the prior uniform-32-SPP 1080p
water band remains unresolved and no complete 4K image is qualified. The browser
uses the normal working connector; no permission/sandbox changes are required.
