# Scene-first room demo

## Scope

Simplify the existing local Eames/room fixture, not the renderer or its transport.
Reuse gpu-lighting composition, camera presets and configurable defaults. Reuse
the same native rendering, optical checks, cancellation and evidence retention.
Parent: site Epic #2113 / Feature #2114 / Story #2301
(https://github.com/Plasius-LTD/plasius-ltd-site/issues/2301). Inherit default-off
`renderer.sampling.adaptivePerPixel.enabled` and `gpu-demo.scene-fidelity.enabled`;
local presets never activate production access. Three.js is prohibited, including
fallbacks. No new packages, model edits, GPU buffers, passes or sampling formulas.

## Interaction design

- Scene first: a large image stage with a useful empty state, persistent status,
  Render/Stop actions and one compact Focus / How to navigate panel.
- Small setup panel: scene recipe (room / upholstery / glass-water), quality
  recipe (adaptive / uniform reference / high-detail adaptive), native resolution
  and lighting. Defaults remain room, 1080p, adaptive 32, six bounces, raw output.
- Recipes are explicit, inspectable patches to the existing controls. Glass-water
  opts into bounded/nested transport, not rough transmission. Upholstery opts into
  sheen and guided denoise. Returning to room clears those recipe experiments.
  Neither recipe certifies optical quality or changes source models.
- User refinement: remove the camera form entirely. One Focus selector chooses
  the existing room entrance/front/corner and sofa/glass close-ups. FOV, distance,
  elevation and normalized target remain configurable package defaults, not DOM
  fields or hidden form controls. Brief navigation help explicitly describes
  focus-then-Render; no live orbit/walk interaction exists in this still fixture.
  Focus changes only camera framing, never silently enables optical/material flags.
- Advanced sampling, materials, glass geometry, model placement and laboratory
  diagnostics are collapsed and grouped. Keep non-camera diagnostic controls.
- Any manual recipe change marks the corresponding recipe Custom. Every change
  retains the previous image with an explicit out-of-date label, hides obsolete
  downloads/comparison actions, and requires Render; no automatic expensive job.
- Reset returns existing defaults and marks any previous image stale. Invalid
  hidden controls expand their containing panels before browser validation.
- All configuration controls lock during captures and diagnostics. Stop remains
  available. Receipts/probes/HDR counts remain unchanged.

## QA inventory (before implementation)

Contact-isolation extension (Story site#2291 / Task gpu-renderer#233): expose the
lighting-owned `supportClearance` in collapsed advanced glass settings, with units
and an explicit diagnostic warning. Forward it through validated scene settings;
default/reset and scene recipes restore the canonical zero clearance. A positive
value lowers only the pedestal top, not the glass, water or camera. Preserve
transport switches, sampling and lighting. Nonzero captures must be identifiable
in both filenames and full scene receipts. Never label this deliberately floating
control a contact fix. No new camera field, transport flag or GPU work is added.
Test labelled routing, recipe/reset/custom behavior and retained evidence before
implementation; physical six/eight-bounce uniform-32 and support-only comparisons
remain required and separate from unit tests. See the lighting #105 design.

Unit/integration: recipe transitions and rollback, maximum from canonical config,
unknown preset/focus rejection, custom detection, default-based camera placement,
removed numeric camera fields, retained non-camera controls, closed advanced panels,
keyboard labels, stale-preview state,
busy guard, hidden-invalid-field reveal, reset, and receipt/probe preservation.

Browser functional + visual (separate): initial room at desktop and narrow width;
recipe/quality changes then Custom/reset; Focus choices and navigation help; advanced expand/
collapse; invalid SPP inside a closed panel; rough optics without nested mode;
Render/Stop without overlapping work; prior image marked stale after edits;
download only current successful output. Inspect image/control fit, focus, contrast,
clipping, scroll behavior and dense expanded state. Real 1080p capture and evidence
integrity smoke check if browser access is available. No new speed/quality claims.

Run tests, coverage, lint, type/build/package/Zero-Three, and exact-head push CI.
Visual/browser checks must remain pending if Computer Use is unavailable. No
release or main/CD changes. Rollback is the previous GPU-native fixture commit.

## Implementation validation

Task: https://github.com/Plasius-LTD/gpu-renderer/issues/239.
The initial implementation retained all 41 legacy fields. The user then requested
removing camera controls except a brief Focus / How to navigate panel. The eight
camera fields are replaced by one Focus selector; the other 33 fields remain.
Separate scene/quality recipes retain their Custom state. Edits retain the previous image, but invalidate evidence,
downloads and comparison controls. All three capture entry points reveal invalid
fields inside closed panels. Diagnostic failure is never labelled a new capture.

Current focus-only revision: 415 tests pass; runtime line coverage 96.38%, branch 83.12%.
The separately executed fixture UI controller has 100% line/branch/function
coverage. Lint, type checks, clean packed consumer, build, package and Zero-Three
checks pass. No runtime source or public API changed; no dependency added.
README and Unreleased CHANGELOG updated. No new architecture decision is needed
for rearranging the existing local fixture and composing its existing settings.

Browser functional/visual and physical render smoke checks are **pending**:
Computer Use reports no browser available, including the in-app browser. HTTP
availability and unit tests do not substitute for those checks. Do not close the
Task or claim visual/physical qualification until they have been performed.
