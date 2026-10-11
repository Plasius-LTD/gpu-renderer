# ADR-0036: Shared in-scene camera for material inspection

- Status: Accepted
- Date: 2026-10-11
- Task: gpu-renderer#230; Story: plasius-ltd-site#2272; Feature: #1170
- Rollout: `gpu-demo.scene-fidelity.enabled`; preserve the GPU route capability.

## Context

Fixed detail views and an angle slider made rope review awkward and diverged from
our shared camera runtime. The rope also lost normal-map detail at close range:
absolute squared tangent thresholds rejected valid small screen derivatives.

## Decision

Use released gpu-camera 0.1.18 and gpu-camera-controls 0.1.1 through a source-demo
DOM adapter. The shared gesture runtime owns pointer orbit, centroid truck and
pinch; the browser normalizer supplies portable events. Its generic browser
bindings target continuous game controls without focus/modifier filtering or
inspection mode selection, so this host adapter owns that scoped event policy.
Damping is zero for on-demand rendering. gpu-camera-controls is a demo-only
development dependency and does not enter the published renderer bundle. The camera
manager, view matrix, controls and projection own transforms; the adapter maps
pointer, wheel and keyboard intent, supplies labelled in-scene modes and allows
button-based movement. Explicit modes distinguish orbital movement, truck and
pedestal, pan and tilt, dolly, and optical zoom. Preserve the camera through
material/renderer recreation. Focus-scoped inputs, pointer capture/cancellation,
bounded travel, lens limits, reset and disposal are part of the contract. There
is no persistent animation loop, inertia, forced motion, collision or picking.

Normalize position and UV derivatives independently before the native shader's
relative degeneracy checks. This changes only tangent direction/validity, not
UV sampling/mipmap derivatives, source maps, material identity or coat layering.
Apply the common shader to both direct and reflected surfaces. Zero UVs retain
the geometric normal; mirrored UVs retain their handedness.

## Validation and delivery

Tests precede implementation for control semantics, bounds, focus and gesture
lifecycle. Shader contract regression demonstrates the original close-up cutoff;
actual WebGPU before/after screenshots verify the visible correction. Test
camera drag/keys/buttons, lens versus dolly, material changes preserving the
view, fray endpoints, coat100/off and 320px layout. Keep shader's standing coverage
exception and changed-source LCOV presence, other code >=80%, all normal CI gates.

This remains the local material review plus package PR. The input adapter is
source-only and is not a new published package or a production entitlement.
Site adoption follows released dependencies and its existing capability/flag;
rollback disables the scene-fidelity rollout or restores the prior package
through approved CD. Never publish or deploy directly from the local preview.

## UI refinement (2026-10-11)

Subsequent user review replaces the persistent mode/movement buttons with direct
mouse/touch gestures and a five-second focus example. Keep keyboard modes and a
persistent accessible description, with `?` replay and Escape dismissal. The
adapter owns one cancellable visibility timer through an optional callback; the
host owns non-interactive, reduced-motion-safe markup. Mouse and touch mappings
are independent of keyboard mode. This supersedes only the button presentation
above; shared runtime ownership, bounded input and lifecycle remain unchanged.
