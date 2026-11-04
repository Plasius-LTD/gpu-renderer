# Renderer correctness review from first principles

Date: 2026-10-20. Active Task: gpu-renderer#234; Story: site#2291;
Feature: site#2114; Epic: site#2113. Owner: zephod111r.

## Review boundary and preserved baseline

The user requested a fresh review of collisions, sampling and glass/water
transport, followed by full-scene verification before adaptive performance work.
Review baseline: renderer `c90e7067981f3ac615f2c34ed4c8ea2a1f6e568d`,
lighting `bac0d5c0aeda57ef29878eb2f92c60ff0775a8ce`, shared
`b68f8682735fa8bffb5179d5e11342521a2f9446`; room assets and receipts retain
their original source manifests/hashes. Preserve all code, prior decisions,
successful and rejected evidence. Existing tests are evidence to examine,
not assumed proofs of the integrated renderer.

This review adds no production behaviour or flag. Existing default-off
`renderer.transport.boundedDielectricBranching.enabled`,
`renderer.transport.nestedMediaRefraction.enabled`,
`renderer.transport.roughDielectricTransport.enabled` and explicit diagnostic
sampler choices remain independent. Feature parent control is
`renderer.sampling.adaptivePerPixel.enabled`. Three.js is prohibited and cannot
be a fallback. Private models/images remain local.

## Contracts to verify

1. Collision admission, distance, culling, nearest-hit selection and continuation
   origins must agree on one ray and actual represented geometry. Positive
   crossings may not disappear solely under coordinate scale, winding or BVH
   order. Distinguish demonstrated defects from unproved numerical guarantees.
2. Camera coordinates and transport dimensions have separate contracts.
   Deterministic pixel-centre camera sampling at one SPP does not establish
   correct joint distributions for successive BSDF/lighting/roulette decisions.
   Camera sample identity, absolute ordinals and complete-count normalization
   must survive compaction and branch scheduling.
3. Fresnel/Snell/TIR, radiance-mode eta scaling, branch probability compensation,
   reflection/transmission hemisphere and medium ownership must agree.
   Apply Beer attenuation once per segment. Bookkeeping-only overlap crossings
   preserve the ray line and scattering depth. Explicitly review termination,
   shadow visibility and partially transmitting surfaces as well as full glass.
4. Examine test independence: analytic references, source extraction, software
   executor limitations, actual assembled WGSL and physical evidence must be
   identifiable. JS coverage percentages do not measure device shader coverage.

## Verification order and acceptance

- Re-run relevant existing numerical/collision/sampling tests at the baseline.
- Build small counterexamples from geometry and estimator equations, not from
  desired output. Retain repeatable inputs, expected results and source lines.
- Record confirmed defects, risks, supported contracts and unsupported cases in
  a versioned review report. Do not change runtime transport during this review.
- Run unchanged physical preflight on the current baseline, then same-build
  empty/filled glass controls and full room at 1080p and 4K with denoise off.
  Record exact camera/SPP/depth/flags, linear HDR, actual counts, device failure,
  timing and allocations. Review fixed/uniform sampling before radial budgets.
- A failed preflight or sample-integrity result rejects the frame. A completed
  image is not convergence/energy evidence. No tolerance changes after outcomes.
- Track any required corrective implementation under the existing hierarchy,
  with tests before fixes, docs and CI. Until physical and image criteria pass,
  full-scene verification is incomplete and adaptive performance work stays next
  in the delivery order. Publication claims remain bounded by retained evidence.

## Primary references

- [PBRT dielectric BSDF](https://pbr-book.org/4ed/Reflection_Models/Dielectric_BSDF)
- [PBRT rounding-error analysis](https://pbr-book.org/4ed/Shapes/Managing_Rounding_Error)
- [WGSL expression evaluation](https://www.w3.org/TR/2026/CRD-WGSL-20260921/#floating-point-evaluation)
- [glTF transmission](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_transmission/README.md)

Review results and physical status are recorded in
`docs/evidence/renderer-first-principles-2026-10-20.md` when available.
