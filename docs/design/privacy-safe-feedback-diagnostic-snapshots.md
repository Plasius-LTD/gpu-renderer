# Privacy-Safe Feedback Diagnostic Snapshots

## Status and ownership

- Status: implementation design
- Tracked task: `Plasius-LTD/gpu-renderer#157`
- Parent story: `Plasius-LTD/plasius-ltd-site#1671`
- Parent rollout flag: `feedback.game-diagnostics.enabled`
- Required capability: `feedback.game-diagnostics.attach`

## Purpose

The renderer may convert a small set of current health observations into the
closed `@plasius/gpu-shared` feedback-diagnostics packet. The operation is
explicit and consented. It is not telemetry, automatic capture, a screenshot
facility, or a general renderer snapshot.

The helper never accepts a canvas, renderer instance, runtime snapshot, DOM
node, player object, URL, filename, adapter/device description, raw warning,
coordinate, or free-text field.

## API

`createFeedbackGameDiagnosticSnapshot(input)` accepts:

- trusted remote feature-flag and capability decisions;
- literal user consent;
- one registered surface plus closed renderer/backend values;
- CSS viewport dimensions and recent numeric FPS/frame-time observations;
- only the shared feature, counter and safe error-code allowlists.

The function returns `null` before reading any observation when the flag,
capability or consent is false. When all gates are true, it converts numeric
observations synchronously and delegates the final closed-object validation to
the focused `@plasius/gpu-shared/feedback-diagnostics` contract.

It derives provenance from the trusted shared surface registration. Callers
cannot provide a provenance identifier.

## Bucketing

Only bucket labels leave the helper:

- viewport orientation is portrait for a square/taller surface and landscape
  for a wider surface;
- a viewport is small below a 600 CSS-pixel shorter edge, medium below a
  900-pixel shorter edge or a 1,440-pixel longer edge, and large otherwise;
- FPS is `under-15`, `15-29`, `30-59`, or `60-plus`;
- frame time is `under-17ms`, `17-33ms`, `34-66ms`, or `over-66ms`;
- missing, negative, non-numeric or non-finite observations become `unknown`.

Viewport width/height, FPS and frame-time values are not returned, retained,
logged or placed in module state.

## Privacy and safety invariants

1. `site.generator` and `site.gpu-demo` are the only possible surfaces.
   `/player-system` is excluded.
2. Flag, capability and consent must all be literal booleans. Disabled paths
   do not inspect renderer facts.
3. Enabled input is a closed object with data properties. Unknown fields,
   accessors, exotic prototypes and proxy failures are converted to one fixed,
   non-identifying error.
4. Provenance is looked up from the package-owned registration.
5. Final validation, uniqueness and bounds come from the shared parser.
6. The diagnostics module has no browser capture, network, storage, logging or
   analytics primitive.
7. The helper is not invoked by renderer lifecycle code. A viewer must call it
   only after an explicit attach action.

## Dependency audit

The task-start audit ran on Node.js 24.18.0 and found zero known production
vulnerabilities. GPU camera and XR dependencies are current. Available ESLint
and globals patch updates and the next c8 major are development-only and
unrelated to this change. The published `@types/webxr` definitions make full
dependency declaration checking possible without a broad `skipLibCheck`
suppression. It is a type-only runtime dependency so packed-package consumers
receive the WebXR globals required by the public `@plasius/gpu-xr` state
contract. The renderer consumes only the focused
`@plasius/gpu-shared/feedback-diagnostics` subpath. The shared package version
that publishes this subpath must be released through protected CD before this
task is merged. The renderer manifest and lock must then consume that published
version and pass a clean `npm ci` plus the full validation matrix. No
unpublished version or local package link may be committed; local package
tarballs and worktree links are used only for pre-release validation.

## Rollout and rollback

`feedback.game-diagnostics.enabled` is remotely persisted and default-off.
`feedback.game-diagnostics.attach` is separately required for user-visible
access. Neither has a normal production environment-variable override.

Disabling the flag makes viewers omit diagnostics while ordinary structured bug
reporting remains available. No packet is cached for later delivery.

## Verification

Tests cover every numeric threshold, unknown values, both registered surfaces,
the `/player-system` exclusion, provenance derivation, flag/capability/consent
gates, observation non-access on disabled paths, accessor/proxy failures,
closed-field rejection, measurement removal, shared validation and absence of
diagnostic capture/transport/storage primitives. A clean packed-tarball
consumer compiles with dependency checking enabled and an empty ambient
`types` list, proving the renderer itself supplies WebXR typing. Viewer and site
tasks must add browser/network assertions that no user-captured pixel or DOM
payload is sent.
