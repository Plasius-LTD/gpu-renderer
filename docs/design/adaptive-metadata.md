# Adaptive metadata — Task 167

Status: default-off infrastructure, not a working adaptive renderer.
Owner: [Task 167](https://github.com/Plasius-LTD/gpu-renderer/issues/167),
Story 2117, Feature 2114, Epic 2113 in the site project.

The user has requested progression from interactive fixed rendering to adaptive
testing. Implement the storage prerequisite now; do not reinterpret that smoke
test as the outstanding provenance-bound fixed/HDR baseline. No performance
qualification or expanded-environment ordering is waived.

## Contract and boundaries

Use one unsigned word per full-screen pixel: requested count in bits 0–8,
completed camera-sample count in bits 9–17, flags in bits 18–31. Counts accept
0–256, not the entire representable nine-bit range. Completed cannot exceed
requested. Zero is an uninitialized record, never an eligible rendering budget.
Flag meanings remain reserved until their owning classifier Tasks implement
them. Sibling paths must not increment completed independently (Task 168).

Final initialization WGSL is the ABI authority. Reflect it through the released
`@plasius/gpu-shader/node` build tool, generate checked byte constants, and test
CPU codecs against that reflection. Never put the Node reflector in browser
bundles. The initialization pass receives already-selected packed budgets and
clears completed counts, not a new budget governor.

The internal resource owner is lazy: construction and disabled acquisition
perform no GPU allocation or pipeline creation. First acquisition admits the
entire requested buffer set against a default 128 MiB cap and device buffer
limits before allocating any member. Invalid dimensions/options fail before
GPU access. Repeated acquisition reuses the same allocation; disposal is
idempotent and blocks later acquisition. Allocation validation/OOM errors and
partial construction clean up without leaking provider diagnostics. Disposal
during acquisition must also clean up before returning.

Optional depth and normal/material/risk words are allocated independently, only
when a later classifier requests them. A 16,384-entry tile-local worklist and
three indirect-dispatch words are reusable. History, when requested by its
separate Task, consists of two packed one-bit-per-pixel masks rounded up to u32
words. No radiance history or full-frame worklist is introduced.

Memory reports planned and actually allocated application-visible bytes,
separating pixel state, classifiers, worklist, dispatch, and history. These are
not physical VRAM measurements and do not imply net memory savings. Buffer
usage excludes readback unless an owning later diagnostic stage requests it;
this increment adds no telemetry/staging allocations.

## Verification and delivery

Tests first: exhaustive legal count pairs and flag boundaries, rejected malformed
words, reflected array strides/member offsets and initialization entry point,
4K byte accounting, exact cap boundaries, limits, lazy/reused/disabled allocation,
partial synchronous/GPU validation/OOM failure, concurrent acquisition, and
disposal races. Preserve all fixed shader/dispatcher/transport source bytes.

Real-device initialization/round-trip execution remains required before closing
Task 167. Reflection is not shader compilation or physical qualification.
Task 168 adds sum/count resolve, Task 169 compact primary dispatch, Task 170
foveation, Task 173 public options/statistics, and shared Task 118 forwarding.
Only released, integrated APIs may subsequently appear in the site GPU tab.

Parent flag `renderer.sampling.adaptivePerPixel.enabled` remains default off.
The site is the remote evaluator; this internal module adds no public toggle.
Rollback uses the unchanged fixed GPU-native dispatcher. Three.js is prohibited
permanently and cannot be a fallback, compatibility path, or waiver.
