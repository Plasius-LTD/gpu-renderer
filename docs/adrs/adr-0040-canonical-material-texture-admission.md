# ADR 0040: Canonical Material Texture Admission

- Status: Accepted
- Date: 2026-10-20
- Task: gpu-renderer#252, parent Feature site#1150; related Feature site#1153
- Blocked consumers: gpu-model-renderer#28 and gpu-model-gltf#14
- Refines ADR0031's canonical ingestion boundary; preserves format/decoder ownership.

## Problem and decision

Core0.5.0 validates six texture slots used by the existing material extension
pipeline. The canonical mapper omitted these slots. Its older public core types
also prevent the bridge's new-core typed integration tests from compiling.
Map thickness, specular, specularColor, iridescence, iridescenceThickness and
anisotropy into the existing volume/specular/iridescence/anisotropy texture fields.
Adopt only registry core^0.5.0 in place of^0.4.4 for the public type contract.
Do not copy canonical validation, add codecs or change GPU transport/packing.

The existing canonical geometry only supplies UV0 and has no texture-transform
application. Reject nonzero/malformed binding or sample UV selections and
nonidentity/malformed canonical transforms before returning mesh inputs. Accept
omitted or explicit identity transforms. This corrects silent marker-only
acceptance; an old UV1 positive fixture becomes an explicit refusal regression,
followed by the unchanged valid UV0 positive path. No test is removed or skipped.

Upstream owns transform baking and reverification of the resulting canonical
binding. A consumer must never erase metadata or substitute UV0 to evade refusal.
The mapper returns no partial result on failure and never mutates canonical
inputs or copies decoded pixels. New failure messages are fixed, bounded and
contain no resource/provider payloads.

## Alternatives and limits

- Continue metadata-only acceptance: rejected because it changes appearance.
- Implement a new decoder/resampler/dual-UV GPU path here: rejected because
  ADR0031 delegates conversion upstream and renderer#220 owns the wider UV path.
- Cast away the older public core type mismatch in bridge tests: rejected;
  the owning renderer must publish compatible declarations first.
- Silently drop new texture slots: rejected; existing renderer extension
  channels already provide their material inputs.

This is a mapping/admission fix, not a physical GPU appearance qualification.
Canonical alpha/unlit gaps remain #237/#238. glTF#14 still owns format material
and resource round trips; no existing loader is removed or consumer cut over.

## Verification and release sequence

Write first-failing fixtures for each new mapping, missing resources, distinct
transform/UV refusal, identity/default acceptance, invalid samples and immutable
rollback. Exercise existing normalization and material packing. Verify actual
core documents and packed ESM/CJS/browser inputs; full published core -> bridge
-> renderer evidence follows the bridge#28 release, which consumes this release.
Keep that final acceptance explicitly pending until observed.

Run frozen install; tests/coverage80%+; changed JS source in LCOV; lint/types/build;
public pack/artifact, Zero-Three and runtime/dependency audit gates. Source
declarations need no workaround; the upstream core type supplies the new slots.
Release a minor through PR/exact-SHA CI and approved main/production cd.yml npm
OIDC; verify registry/provenance before bridge adoption. No local publication,
production settings change or ACA deployment is needed.

## NFR and rollback

- Security/privacy: checked by explicit unsupported interpretation and missing
  resource refusal, bounded decoded sample validation and payload-free new errors.
- Reliability/performance/scalability: synchronous bounded mapping over already
  prepared inputs; no new I/O, retries, allocations proportional to image pixels,
  cache or async wait. Existing upstream preparation owns deadlines/cancellation.
- Maintainability/testability: reuse core types and existing extension/packing
  functions; first-failing contract tests and whole-package source coverage.
- Observability: existing controlled exceptions; no logging or sensitive data.
- Reproducibility/portability: frozen registry dependencies, installed ESM/CJS
  and real-browser consumer probes, package/provenance checks. Record actual
  command results/commit/times in the Task; do not infer browser matrix coverage.
- Accessibility/SEO: N/A, no UI/content change. Visual GPU qualification is not
  claimed for this data mapping/refusal fix.
- Deployment safety: remote gpu.model.conversion.enabled remains the consuming
  host's decision. On rejection or rollback, retain the previous supported loader
  and compatible package set. No new capability or local flag control is added.
