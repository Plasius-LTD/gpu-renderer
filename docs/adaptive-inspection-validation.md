# Adaptive model inspection validation

2026-10-14. Local WebGPU inspection; experimental source integration, not production qualification.

- Large Castle Door at native 3840×2160, ceiling32, six bounces: 510/510 tiles complete, mean5.95, denoising both on and off. DOM canvas backing dimensions independently confirmed3840×2160.
- Ceiling256, 20 bounces, 480×314: 12/12 tiles complete, mean47.60.
- Keyboard camera movement resets progress and starts a new pass. Switching from adaptive to fixed during refinement cancels old work and clamps depth20 to12; fixed1SPP completes.
- Adaptive ceiling1 completes its validated adaptive pass after the preview.
- At320px viewport, adaptive controls have no horizontal document overflow. Native selects remain keyboard-accessible. Existing pointer/touch controls are reused; physical touch hardware and screen-reader speech were not tested.
- CPU tests cover copied/bounded budgets, pixel-count and failure-word rejection, readback cleanup, initialization deadlines, abort/disposal, exclusive adaptive/ordinary rendering, mode switching, stale progress and paused work. All changed runtime sources appear in LCOV.
- Package inspection confirms the adaptive renderer and radial lighting imports remain dynamic external subpaths in both shared ESM and CJS, rather than accidentally bundling the older installed policy.

The radial allocation is prescribed, not a variance classifier. The linked branch's glass/optical experiments still require their own visual qualification. No package publication, production deployment, public capability change or remote flag mutation occurred. Draft release dependencies must be reconciled against approved CD artifacts before shipping.
