# Preserve authored material colour independently of illumination

Task renderer#226 / Story site#2268 / Feature site#2114. Continue the retained
cloth-map investigation without inventing missing textures or boosting normals.

Implemented in `798822458dc55d4de5736705c02c8525301b22a7`; the requirements below
describe the pre-fix defect and frozen checks. See the
[physical evidence and remaining limitations](../evidence/authored-colour-2026-10-05.md).

## Evidence and scope

The supplied default fabric has base colour (UV0, 7x), normal (UV0, 2x,
strength 0.6), and ambient occlusion (UV1) textures. Roughness 0.8 and sheen
colour/roughness are factors; there are no fabric roughness, sheen, displacement
or second normal image maps to recover. Confirm decoded texture slots before
attributing any residual appearance difference to a dropped map.

The canonical BSDF and approximate terminal helpers currently raise authored
colour using ambient light. This couples a material property to illumination,
overwrites dark/saturated texture channels and gives a black diffuse material
nonzero diffuse reflectance. Remove only those material-colour floors in GPU
and CPU references. Ambient/environment radiance remains an illumination source.
Preserve PDFs, MIS, sheen, occlusion handling, sampling, normal validity, path
ownership, termination policy and all authored texture bytes/UVs.

Occlusion currently attenuates direct BSDF response as well as indirect light;
that is a separate known deviation from glTF, not fixed in this colour change.
No photorealism or full glTF conformance claim is permitted.

## Frozen tests and evidence

- Fail-first unit: normal-incidence black/dark/saturated/white diffuse values
  equal colour/pi with specular disabled. Changing ambient must not alter BSDF,
  PDF or throughput for the same material and incident directions.
- Metal and dielectric normal-incidence expectations use closed-form GGX,
  not the renderer CPU implementation as sole oracle. Tolerance 2e-6 absolute
  for physical GPU arithmetic; CPU analytic tolerance 1e-10.
- Black terminal residual remains black; nonzero ambient/source is retained.
- Physical assembled shader: independent analytic checks, sheen off/on ambient
  invariance, positive PDF, finite outputs, no GPU validation errors. Small
  analytic probes are correctness tests, never resolution/performance evidence.
- Retain actual decoded map inventory with dimensions, UV channel, transforms,
  strength and byte hashes in both diagnostic and room receipts. No model pixels
  or private file bytes committed. Missing authored slots fail the local audit.
- Compare the existing native 4K/128-SPP lighting diagnostic with identical
  settings; retain linear HDR and PNG. Run the full 1080p/128-SPP/six-bounce room
  close-up against the previous retained raw/clean reference, same geometry,
  camera, lights, splitting, sampler and flags. Count/guide integrity must pass.
- UI QA: no new public controls; same-frame raw/clean and four diagnostic views,
  invalid settings/reset, cancellation, normal and 720px layout, native images.
- Full tests/coverage and changed-source LCOV, types/lint/build/package/Zero-Three,
  dependency audit, README/Unreleased CHANGELOG, physical evidence, exact-head CI.

The fix adds no runtime allocations, rays, dispatches, texture samples or flags.
Parent renderer.sampling.adaptivePerPixel.enabled and public exposure flag
gpu-demo.scene-fidelity.enabled stay off. Existing material/denoise child flags
remain independent. A qualified GPU-native release rollback is the safety path;
there is no compatibility mode restoring incorrect colour. Three.js is prohibited.
Do not claim quality equivalence, convergence, speedup or publish a package locally.
