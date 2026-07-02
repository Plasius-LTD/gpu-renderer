# ADR 0020: Animated Camera Rig Integration

- Status: Accepted
- Date: 2026-07-02

## Context

The GPU Demo animated character scene needs editor, spectator, third-person,
and first-person camera modes. The camera math belongs in
`@plasius/gpu-camera`, but the renderer owns scene anchors, animation
snapshots, and the eventual point where camera-derived head-look intent can be
blended into animated bones.

## Decision

`createAnimatedSceneRenderer(...)` consumes `@plasius/gpu-camera` rig frames for
animated scene cameras. Legacy `camera.mode: "lagged-follow"` remains accepted
and maps to spectator behavior. Renderer snapshots now include the resolved
view mode, camera transform, target distance, and head-look state.

Head-look intent is treated as a post-animation input. The renderer exposes the
intent and applies only fallback visualization in the current canvas renderer;
future skeletal renderers must blend the same intent after clip evaluation and
must not mutate source clip data.

## Consequences

- Positive: Animated scene consumers get a stable camera snapshot contract.
- Positive: The camera package owns reusable rig constraints while the renderer
  owns animation/anchor integration.
- Positive: Missing head anchors fail soft with `headLook.status:
  "unavailable"`.
- Tradeoff: The current canvas renderer can only visualize head-look intent;
  full bone application requires the skeletal renderer path.

## Alternatives Considered

- Keep camera modes in the site page: Rejected because package consumers would
  duplicate camera constraints and head-look semantics.
- Apply head-look inside `@plasius/gpu-camera`: Rejected because bone blending
  belongs with renderer/animation state, not generic camera math.
