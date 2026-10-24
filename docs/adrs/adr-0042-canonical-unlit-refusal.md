# ADR 0042: Canonical unlit refusal

- Status: Accepted
- Date: 2026-10-24
- Task: gpu-renderer#238; Story site#2296; Feature site#1153
- Supersedes only ADR0031's acceptance of canonical unlit workflows.

## Problem and decision

The canonical adapter injected/preserved an unlit extension marker but the GPU
material packing and shading path did not implement lighting-independent unlit
semantics. The previous metadata-only positive assertion advertised rendering
support without proving it. The core source-document type intentionally includes
more workflows than this renderer implements; do not duplicate or narrow its
schema to hide that distinction.

Reject referenced `workflow: "unlit"` materials and any declared own
`KHR_materials_unlit` or `unlit` extension key before texture lookup or returning
meshes. This includes empty, populated, disabled-looking or malformed marker
values: a marker cannot authorize a missing shading path. Use one fixed bounded
diagnostic, without material/resource payloads, directing callers to retain an
unlit-capable rendering path. Remove the adapter's marker injection. Existing
custom/mask/topology refusal and supported metallic-roughness/alpha/extension
packing remain unchanged. Direct legacy Wavefront metadata APIs are unchanged;
this decision makes no claim that they implement unlit shading.

The function builds results locally and returns no partial replacement after a
failure; caller-owned documents, decoded geometry and pixels remain unchanged.
Only referenced materials pass through this boundary; unused source records do
not advertise rendering support. Consumers must not erase markers, relabel
unlit as lit, or substitute emissive factors to force acceptance.

## Alternatives

- Implement unlit transport now: deferred. It requires deliberate packing and
  shader semantics, texture/alpha handling, changed-light invariance and physical
  image qualification. Task#238 explicitly permits refusal instead.
- Keep the marker-only normalization test: rejected because metadata cannot
  establish lighting-independent rendering.
- Approximate unlit as emissive: rejected because it changes transport and
  lighting semantics without a defined contract.
- Reject only the workflow string: insufficient while a canonical material can
  also declare the unsupported interpretation in its extension record.

## Validation and release

First-failing tests cover unlit workflow across opaque/blend and absent/zero/
partial/full texture alpha, both extension spellings and marker shapes, no
texture lookup, immutable multi-primitive failure and retained current model.
Positive PBR/alpha/extension packing and existing refusal controls remain tested.
Change the misleading previous unlit metadata assertion into an explicit refusal
regression; remove no test or gate. Test actual packed and published ESM/CJS APIs
and strict public declarations. Unlit image/light-invariance qualification is
N/A because no unlit material is accepted or shader implemented. Reuse the
physical lit-alpha probe to guard the existing rendering path independently.

Run frozen npm install, tests/coverage80%+ and changed-source LCOV, lint/types/
build, Zero-Three/public artifact/pack checks, full audit and strict dependency
tree/signatures. Update README, integration and Unreleased; add an explicit
superseding status link to ADR0031 while retaining accepted history. Release
through protected PR/required CI, exact-main CI and approved main `cd.yml`
production publishing only. The workflow owns versions and changelog promotion.
Verify sealed/public package identity/integrity/provenance and registry consumers
before completion; do not publish locally or introduce a new package/dependency.

## NFR and rollout

- Security/privacy/reliability: fixed bounded refusal before resource lookup or
  returned output; no new I/O, retry, logging, secret or access surface.
- Performance/scalability: two constant own-key checks replace unsupported
  marker construction; no image copy, record/layout or shader change.
- Maintainability/testability: existing adapter/core types reused; regression,
  immutable-failure and positive packing tests, full source coverage.
- Reproducibility/portability: frozen dependencies, packed/registry consumers and
  existing lit GPU path qualification. Record actual commands/commits/times.
- Observability: actionable controlled error; no automatic diagnostic capture.
- Accessibility/SEO: N/A, no UI/navigation/content interaction changes.
- Compatibility: formerly accepted but unsupported canonical unlit now refuses
  deliberately. Supported metallic-roughness and direct legacy APIs remain.
- Deployment safety: inherited stored `gpu.model.conversion.enabled` remains
  consumer-host evaluated for adoption/disable/rollback only; no control change.
  On refusal, disabled rollout or unavailable store, retain the prior supported
  renderer path and compatible package set. Refusal is unconditional; no
  capability or local flag may re-enable unsupported shading.
- Backend secret references: N/A, npm-only release with no site/ACA deployment.
