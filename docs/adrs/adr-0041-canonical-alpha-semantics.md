# ADR 0041: Canonical alpha semantics

- Status: Accepted
- Date: 2026-10-24
- Task: gpu-renderer#237; Story site#2296; Feature site#1153
- Refines ADR0031/0040 for alpha; other material support boundaries are unchanged.

## Problem and decision

The canonical adapter copied factor alpha into both color and opacity. The
material shader multiplied both, squaring blend alpha. Opaque mode retained
factor and texture alpha, so setting opacity alone could not enforce opacity.

Carry optional `alphaMode: "opaque" | "blend"` through the existing mesh
contract. Canonical inputs set the mode and opacity one, leaving RGB and factor
alpha intact. Normalize opaque opacity to one and default blend opacity to one.
Explicit blend opacity remains an additional multiplier for direct mesh callers.
Reject other explicitly supplied modes with a fixed bounded diagnostic. Omitted
mode retains the existing direct Wavefront semantics and opacity defaults.

Reserve the unused `textureSettings.w` component for ignoring factor/texture
alpha: one for opaque, zero otherwise. Write it in material records, CPU triangle
records and GPU mesh ranges. The existing GPU triangle-build kernel already
copies this vector. The production material sampler uses alpha one for opaque;
otherwise it samples the existing factor × texture alpha and opacity product.
Record sizes, RGB conversion, atlas bytes, lighting, exposure, IOR and
transmission are unchanged. Mask support remains explicitly rejected at the
canonical boundary. This does not implement unlit support (separate Task#238).

## Alternatives

- Change all Wavefront opacity defaults: rejected because it changes legacy
  callers unrelated to canonical adoption.
- Rewrite opaque texture alpha on the CPU: rejected because it copies pixels,
  loses authored data and duplicates material interpretation outside the shader.
- Infer opaque from opacity one or material kind: rejected because blend may
  have factor one with transparent textures; transmission is an independent
  material property.
- Add a new GPU record/layout: unnecessary while an existing reserved component
  can carry this one decision through both preparation paths.

## Verification and release

First-failing tests cover factor alpha0/.25/.5/1, missing/zero/partial/full texture
alpha, opaque and blend, legacy default/explicit opacity, immutable input and
explicit admission. Inspect actual packed material, triangle and GPU-mesh bytes,
with RGB/transmission/IOR controls. Run the production assembled WGSL on a
nonfallback physical WebGPU device using `tests/browser/canonical-alpha-probe.js`
against the actual built/packed API. Its added compute entry only reads the
production `sample_surface_material` result; it does not replace its equations.
Run both uploaded CPU triangles and `prepareMeshTrianglesAndLeaves` GPU output,
read back opacity and RGB, retain device/compilation/result evidence. This is
physical material evaluation, not a rendered scene or full browser/device matrix.

Run frozen npm install, full tests/coverage80%+, every changed JS source in LCOV,
lint, strict public type checks, build, Zero-Three/public artifact checks, pack,
dependency audit, and actual packed ESM/CJS consumers. Release through reviewed
PR, pushed exact-SHA CI, then approved main `cd.yml` prepare/publish using the
production environment. The workflow owns versioned changelog promotion.
Verify registry package bytes/integrity/provenance and fresh consumers before
completion. No local publication or site deployment is part of this Task.

## NFR and rollback

- Security/privacy/reliability: fixed mode admission; no new I/O, logging, secret
  handling or retries. Existing upstream resource limits remain authoritative.
- Performance/scalability: constant per-material arithmetic; no new pixel copy,
  atlas expansion or GPU record size. Shader adds one selection.
- Maintainability/testability: reuse existing packers, core document types and
  renderer shader paths; regression and actual GPU qualification cover both
  preparation paths and legacy compatibility.
- Observability: existing bounded errors; no diagnostic capture in the runtime.
- Reproducibility/portability: frozen registry dependencies; source, packed and
  registry consumers; report actual browser coverage without inferring others.
- Accessibility/SEO: N/A, no user interface/content/interaction changes.
- Deployment: inherited stored `gpu.model.conversion.enabled` is evaluated by
  the consuming host for adoption only. Disable/rollback retains its supported
  loader and compatible package set. Rejection or unavailable control store
  must retain that safe path. Alpha correctness is unconditional in this package;
  no capability, new gate, env override or control setting change is needed.
- Backend secret references: N/A, package publication creates no backend deploy.
