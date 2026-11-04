# ADR 0051: Surface sidedness and valid normal-mapped shading

Status: accepted (2026-09-28). Tasks renderer #221 / shared #134.
Physical defect probes and native reference captures passed; broad image/energy
and performance qualification remains separate.

## Evidence and scope

Feature: Plasius-LTD/plasius-ltd-site#2114, following the material-fidelity
prerequisite in Story #2256. The loader discarded glTF `doubleSided`; triangle
intersection accepted both windings. Separately, sampled black front-facing
cloth points had view-opposed mapped normals, causing the BSDF to return zero.
These are distinct defects, not evidence that more SPP or denoising fixes them.

## Decision

Preserve authored `doubleSided` from glTF to renderer meshes, default false.
Reject single-sided back-face candidates during traversal and keep searching;
never consume a bounce or terminate a path for a rejected candidate. Explicit
double-sided surfaces retain oriented back-face lighting. A ray already inside
the explicitly identified transport medium may still find its exit boundary;
this is not permission for exterior rays to shade opaque back faces.

Reserve bit 30 of mesh/triangle flags for normalized `doubleSided`, without
changing allocation sizes, ray records, queues, or dispatch counts. Caller flags
cannot override the boolean; other flag bits are retained.
CPU and GPU geometry builders and reference traversal must agree.

Construct a handed orthonormal tangent frame against the interpolated normal,
using the normal texture's selected UV set. Reverse the whole mapped normal on
accepted back faces. This triangle-derived fallback is not full MikkTSpace or
authored-tangent support. Repair invalid reflection hemispheres once at hit
construction: project an invalid reflected direction onto the geometric
hemisphere, then obtain the shading normal from its bisector with the view.
Keep already valid normals unchanged. All BSDF sampling, evaluation, PDF/MIS,
and denoising consumers use that same stored normal. Never use a mapped normal
to decide geometric sidedness. Geometric normals still govern offsets/media.

The validity repair is a bounded, view-dependent normal-mapping approximation,
not a new energy-conservation or reciprocity claim. It must be measured, with
raw HDR retained, rather than compensated using exposure, colour, AO, roughness,
extra samples, or denoise. Existing transport weights/termination stay unchanged.

## Acceptance and risks

Requirements-first tests cover glTF defaults/true/false, forward/back hits,
traversal past a rejected face, shadow visibility, explicit medium exit,
CPU/GPU packing parity, mirrored/degenerate UVs, back-face frame orientation,
finite view/geometric hemispheres, unchanged valid normals and neutral maps.
Physically compile the assembled shaders and exercise these cases on WebGPU.
Retain same-camera 1080p/4K room captures, six bounces, same sample sequence and
completed SPP; compare raw HDR and visible black patches before/after. Do not
claim noise-free rendering or matched-quality speedup from a single capture.

Risks: incorrect mesh winding becomes visible, normal repair changes local
appearance, added per-hit arithmetic, and medium-exit leakage if keyed loosely.
No new GPU allocations or dispatches are permitted. Denoise eligibility, AO,
mipmapping, new lobes, scheduling and asset edits are outside scope.

Rollout inherits `gpu-demo.scene-fidelity.enabled` and the default-off adaptive
Feature flag `renderer.sampling.adaptivePerPixel.enabled`; these correctness
fixes apply to fixed rendering too. Roll back the GPU-native release if needed.
Three.js is prohibited and cannot be a fallback. Update README/CHANGELOG, run
tests/coverage (>=80%, changed-source LCOV), types/lint/build/package/Zero-Three,
physical evidence and post-push CI. No local publishing or main/CD in this task.

## References

Implementation evidence: renderer commit
`e718af58937693b8f28ce5cb2018ba860e65f32d`, paired with shared commit
`861005966d3af7dea4613130ae8b96310ec09ead`. The assembled GPU probe passes
single-/double-sided candidate tests, matching/mismatched medium exits,
orthonormal/mirrored/degenerate UV frames, 128 grazing directions, unchanged
valid normals and finite positive repaired BSDF/PDF values. The 19-case dual-UV
probe also verifies the sidedness flag through both geometry preparation paths.
Native 1080p/4K six-bounce captures retain identical completed sample counts,
raw/filtered HDR and allocation inventories, with no reported GPU failures.
Residual grain and increased diagnostic time prevent a noise-free/speedup claim.

Local checks: 343 renderer tests, 96.15% line coverage; 111 shared tests, 88.14%.
All changed JavaScript source files appear in LCOV. Lint/types/build/package and
full Zero-Three gates pass. Post-push renderer CI run 36472229260 and shared run
36472234118 succeed. Branch review/merge and approved CD remain outstanding.

- [glTF sidedness](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#double-sided).
- Blender Cycles `ensure_valid_specular_reflection` documents the related
  need to keep mapped reflection above geometry; this implementation uses a
  direction-projection construction, not its polynomial solver.
