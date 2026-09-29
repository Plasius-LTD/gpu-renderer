# Native showcase scene quality

The public GPU demo needs improvements to rendered pixels, not more page chrome.
The current Shoreline is a Canvas2D triangle painter. The professional animation
adapter validates assets but does not draw them. Product Studio's source-fidelity
and adaptive transport work is tracked independently and must not be overwritten.

## Delivery boundaries

1. `@plasius/gpu-renderer` owns a reusable native WebGPU surface renderer with
   depth-tested geometry, material roughness/metalness, filtered directional
   shadows, antialiasing, atmospheric sky and animated reflective water. It reuses
   the existing device/lifecycle boundary. No rendering code belongs in the site.
2. `@plasius/gpu-shared` supplies the existing harbour models, world transforms,
   cloth geometry and camera to this renderer. Its legacy canvas path remains an
   explicit rollback, never reported as native rendering. No new heavyweight
   third-party framework or duplicated GPU-family implementation is introduced.
3. The site consumes published packages and passes its remotely evaluated
   `gpu-demo.scene-fidelity.enabled` decision. Existing route capability remains
   the access authority. The native path is opt-in until visual validation passes.
4. Animation follows the existing Story 1398: real textured skinned drawing,
   authored root motion, approved environment assets and truthful diagnostics.
   Enabling its flag cannot substitute for missing rendering or assets.

## Acceptance and verification

- Actual GPU draw calls and retained before/after images prove geometry, water,
  occlusion, lighting and shadows. A changed page screenshot is insufficient.
- Tests first cover input validation, draw submission, resource cleanup, resize,
  pause, device loss and disabled/unsupported fallback. Every changed source file
  appears in LCOV; maintain the package's 80% gate (shader exception unchanged).
- Use bounded mesh counts, buffers and render resolution. No per-frame device or
  pipeline creation. Dispose old targets on resize and all resources on teardown.
- Native rendering reports only active features. No ray tracing or photorealism
  claim for a raster scene. Measure real frame time; do not invent telemetry.
- Preserve accessible controls, reduced motion, keyboard support, lazy loading
  and the shared site shell. Test a narrow viewport and unavailable WebGPU.
- Review material response, silhouettes, composition, motion and water at full
  size before calling the scene professional. Record remaining deficiencies.
- README, Unreleased changelog and ADR accompany implementation. Package CI/CD
  precedes site integration; production only through the approved main CD path.

## Initial art direction

Use natural materials and restrained cinematic lighting. Keep the established
harbour rather than inventing game lore or substituting a static illustration.
The initial native pass establishes real lighting and water; model/animation
quality remains subject to direct visual review, not merely passing tests.
