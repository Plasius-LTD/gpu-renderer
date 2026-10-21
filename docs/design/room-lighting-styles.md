# Local room lighting styles

Under renderer #226, site Story #2268, Feature #2114 and Epic #2113.
The user requests a slightly cooler time-of-day style for the existing room.

Reuse `gpu-lighting.createWavefrontEnvironmentLightingOptions` with explicit
fixture configuration snapshots. Offer original daylight and a modest cool
evening/blue-hour colour study, plus adjustable intensity. This is an artistic
colour preset, not solar-position simulation or a calibrated colour reference.
Keep light direction, exposure, camera, models, materials and transport unchanged.
No AO/filtering fix, dependency, new renderer API, shader or runtime allocation.

Original daylight remains the initial/reset default. Select cool evening for the
requested capture. Settings are validated and controls lock during render. Cache
decoded models only: rebuild lighting on every run, including cache hits, and
retain the exact request and resolved lighting snapshot in the receipt. Label
captures with style identity. Both variants still use full GPU transport.
The separate cloth normal diagnostic remains its documented white-light study.

Parent remote flags `renderer.sampling.adaptivePerPixel.enabled` and
`gpu-demo.scene-fidelity.enabled` remain off. The local fixture is an explicit
validation lane, not a production rollout or a new entitlement. Rollback selects
original daylight or returns to the prior GPU-native fixture commit. Three.js is
prohibited, including any fallback.

## Acceptance and QA

Requirements-first unit tests: original request equivalence; cool sun/sky ordering;
finite bounded intensity and invalid style rejection; independent snapshots;
factory reuse and receipt identity; cache-hit lighting refresh; initial/reset,
locking and stale capture invalidation. Test intensity endpoints and invalid
values. No source asset or camera modification.

Browser checks via actual controls: daylight → cool → daylight; adjust/reset
intensity; invalid intensity; cancelled render; rerender with cached assets and
confirm current selection in receipt. Inspect labels/controls and final room at
normal and narrow viewports, check overflow and raw/clean previews. Retain a
physical native 1080p or 4K cool capture with complete sample counts, unchanged
geometry, zero validation errors and cleanup. Do not treat a style change as an
accuracy or performance improvement. Keep private model/capture bytes local.

Update README/Unreleased CHANGELOG, run relevant tests plus coverage, types, lint,
build/package/Zero-Three gates and exact-head CI after push. Existing Task #226
stays open until its broader material qualification is complete. No main/CD,
production flag changes or local package publishing.
