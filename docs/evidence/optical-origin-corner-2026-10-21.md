# Physical origin-rounding regression — 21 October 2026

Task gpu-renderer#234 / site Story2291 / Feature2114. All previous source and
evidence remain. Normal Playwright connector list/navigation/snapshot/controls
now work with WebGPU, without changing sandbox or approval configuration. The
prior browser blocker is no longer assumed. No exact cause for its earlier
access denial has been established.

## Retained first attempt

Renderer [cdfecb02feb3a569fdd723542a31f5c776f34634](https://github.com/Plasius-LTD/gpu-renderer/commit/cdfecb02feb3a569fdd723542a31f5c776f34634),
lighting bac0d5c0aeda57ef29878eb2f92c60ff0775a8ce, shared
b68f8682735fa8bffb5179d5e11342521a2f9446, site asset pin
21d43a9b63722f1ce69175a5a42b53304ee79102. Physical Apple/metal-3,
non-fallback adapter. No exact GPU-chip identity is inferred from that metadata.

The six-lane batch stopped at its first lane: empty-glass close-up, native
1920x1080, uniform32,20 bounces, corrected fixed-camera transport, denoise and
splitting off, bounded+nested on, rough optical transport off,0.0001m clearance.
The then-existing26-case dielectric/ordering/rim/origin, conditional-sampling,
parity, UV, surface and material preflights completed before the scene. The new
tiny-component case did not yet exist. Only a favicon404 was logged.

Capture directory:
`room-reference-2026-10-21T07-18-07-331Z-f2cfced3-b221-4958-9bf9-a5c71812cb23`.
`failed-room-reference.json` SHA256:
`3dbd1416e05706bfb0dfe2f594afebac6388d6497271ac53b8f635d791bbb7a6`.
Failed aggregate directory: `room-qualification-e8995bc5-798d-443e-b133-76dc01531bf9`;
summary SHA256: `47b2aa17fdd4a8576dd2ec1fe400942161518e35795b5511626ec08c31092ca7`.
Raw private scene assets/images remain local. The failure marker is not a scene
render, and no complete HDR frame was produced. Missing cleanupPassed in this
failed receipt is not promoted to proof of successful cleanup.

Tile97 `(896,768,128,128)` rejects `primary-ray-count-mismatch:163840/524288`.
This is not a standalone proof of broken primary generation: adaptive control96
marks a failed sample and later rounds do not execute. Canonical failed node:
pixel1535086/sample9/bounce2, reason2, primitive353098. No queue overflow or
invalid-radiance event was reported by the final-sample counters; they cover
only the last encoded sample, not the whole failed tile.

## First divergence

The retained canonical journal records:

1. Camera hits outer wall353199 and enters glass92. Reconstructed point
   `(2.902547836303711,-0.6940839886665344,-0.08385929465293884)` is one y-ULP
   above the bottom at `-0.6940840482711792`.
2. Normal `(0.9569413065910339,1.2064722831883756e-10,0.2902815639972687)`,
   projected error `2.004084763029823e-6`. Per-component outward rounding moves
   y onto the bottom even though its actual displacement is far below one ULP.
3. The next canonical hit is the pedestal353002 while the ray still owns glass92.
   Its upward scatter later meets bottom353098 as another entry, causing reason2.

The geometry-only replay has different origin handling and finds the real bottom
exit at about1.44146e-7m. It is supporting geometry evidence, not a replacement
for the canonical history. The exact numerical regression reproduces origin-y
collapse and a zero/missing next exit before the correction.

## Correction and limits

Keep the same projected error, but clear it on only the dominant normal axis.
For k=argmax(abs(n)), delta[k]=side*error/n[k]. Normal projection retains the
required signed error while other coordinates stay unchanged. Round that axis
outward. No new distance tolerance, medium reset, lost sample, gap or failed
image is accepted. Existing zero-error behavior, shader records, buffers,
dispatches, sampling and BSDF stay unchanged. [ADR0063 follow-up](../adrs/adr-0063-optical-contract-corrections.md).

Tests first: exact captured point/next bottom plus150 signed/permuted/translated
cases fail the former implementation. The corrected cases retain the adjacent
exit and the required projection; old corner/order/rim, geometry, disabled,
energy and sampling checks remain. Assembled preflight grows from26 to27 cases,
including the exact origin case, with strict failure injections. Qualification
summaries now preserve failed-lane identity/root failure, covered by a red test,
instead of hiding it behind a generic receipt rejection.

Local full suite:461 tests pass,96.42% lines/83.20% branches. The sole changed
runtime module is present in LCOV at100%. Lint, types/clean consumer, build,
public-package, all nine Zero-Three checks and runtime dependency audit pass.
The canonical shader SHA256 is
`37b8a72ebae4677f7f9fa45ffd88f973e1f80372eefa10565d330ebbba507bd1`.
Post-push CI and the corrected physical scene rerun are recorded in the follow-up
delivery evidence. At this checkpoint the initial attempt failed;
the later five lanes were not executed and band removal remains unconfirmed.
No adaptive performance work has resumed; no speed/memory/publication claim.
