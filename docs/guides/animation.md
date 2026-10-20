# Animation surfaces

## Animated Scene Renderer

`createAnimatedSceneRenderer` provides the renderer-owned v1 surface for the
GPU animation adventure demo. It accepts scripted beats, route points, props,
and a backward-compatible `lagged-follow` camera rig that now resolves through
the shared `@plasius/gpu-camera` editor, spectator, third-person, and
first-person rig primitives. The renderer exposes `start`, `resize`,
`getSnapshot`, `setCamera`, `setCameraViewMode`, `applyCameraControl`, and
`destroy` for host packages. Third-person distance is clamped by camera
constraints, first-person resolves from the head anchor, and head-look is
reported as transient post-animation intent instead of mutating clip data. It
is implemented inside `gpu-renderer` and does not route animation playback
through Three.js. When hosts provide
`modelAsset` and `clipAssets`, the v1 canvas renderer parses the Peasant Girl
GLB mesh, skin, inverse-bind matrices, and Mixamo-compatible clip channels,
then CPU-skins the active clip and draws model-derived geometry into the
adventure canvas. Snapshots expose `modelRenderable`, `fallbackProxyActive`,
`skinnedVertexCount`, `skinnedJointCount`, `activeClipRenderable`,
`cameraViewMode`, `cameraTransform`, `targetDistance`, `headLook`,
`characterVisible`, `characterGroundY`, and `propGroundAnchors` so hosts can
catch camera, scene grounding, and model-renderability regressions.
When hosts provide beat `movementRequirement` fields and clip
`movementProfile` metadata, character displacement is resolved per beat:
travel/jump beats move between route anchors, while stationary action beats
hold their current anchor unless the profile explicitly allows authored root
translation. Snapshots expose movement validation diagnostics so hosts can
detect mismatched animation motion before accepting playback.

`createProfessionalAnimatedSceneRenderer` is the fail-closed WebGPU entrypoint
for the professional Animation Adventure path. It requires a WebGPU canvas,
skinned GLB character metadata with UVs, normals, diffuse and normal textures,
and root-authored movement profiles for travel beats. It rejects the legacy
2D proxy path instead of silently falling back, renders through WebGPU, and
exposes `renderMode: "webgpu-pbr"`, texture counts, normal-map readiness,
root-motion policy, character position, camera position, and active clip
diagnostics for host validation. Repeated travel beats accumulate root-motion
distance from the clip duration and loop count, capped by the declared movement
requirement and route segment. The current surface establishes the WebGPU
lifecycle and validation boundary for the PBR animation path; shader-level
textured character and environment drawing builds on this boundary.
