# Isolate cloth normal response

Tracked under site Epic #2113 / Feature #2114 / Story #2268 and renderer #226.
The existing full-transport close-up retains colour/normal signal but subdued
lit detail. This experiment must identify causes before changing material math.

## Controlled diagnostic (not another production renderer)

Reuse canonical assembled WGSL camera, BVH intersection, material sampling,
normal validity and BSDF evaluation, plus the same private room composition.
At native 1080p (optionally 4K), evaluate four matched images: authored normal
map on/off, each with centred or normal multi-sample camera rays. Only the
off control sets normal strength to zero; authored pixels, UVs, colour, roughness
and sheen remain unchanged. No material-strength boost or invented weave.

Illuminate visible hits with one configurable shallow-angle directional light,
relative to the seating orientation. This deliberately omits shadows, indirect
transport and denoising to isolate angular material response; it is neither a
full-path comparison nor a performance/photorealism claim. Pixel-centre sampling
is diagnostic only, not a replacement camera-sampling contract. Record before/
after validity correction angles from the actual canonical GPU material path.

Use tile-sized GPU output/readback buffers, no new production resources. Retain
native PNGs and linear HDR with hashes locally, including complete settings,
source provenance, mesh IDs, count checks, timings and allocation accounting.
The fixture is opt-in; existing Render and Reset behavior remains unchanged.
Parent flags renderer.sampling.adaptivePerPixel.enabled and
gpu-demo.scene-fidelity.enabled stay off; existing sheen selection remains explicit.
No new public API or runtime architecture. Three.js is never a fallback.

## Frozen checks and interpretation

- Unit: isolated normal-off control; complete scene/camera preservation;
  finite bounds, configurable angle/intensity and sample ceiling; shader reuse
  guards fail closed when canonical camera/BSDF integration points change.
- GPU: assembled shader compiles; no validation/device/overflow errors; finite
  nonnegative radiance; every native pixel gets the selected sample count.
  One-sample centred/sampled controls must match (stable camera starts centred).
- Normal correction is significant above 0.1 degrees. Record distributions,
  mapped tilt and max correction, restricted to the actual seating mesh IDs.
- Compare map on/off RGB RMSE and high-frequency (4-neighbour Laplacian) RMS
  within same-mesh seating interiors, excluding silhouette/background pixels.
  Exclude pixels without their four seating neighbours. These are diagnostic
  signal metrics, not reference-image accuracy or convergence thresholds.
- Functional/visual QA: run/select all four views, reset/invalidation, invalid
  settings and cancellation; normal and narrower viewport; inspect native pixels.
- No raw-vs-clean inference: denoising is absent. No speedup claim. This stage
  may reveal a cause but cannot close the broader lit-cloth qualification Task.

Runtime fixes require a separately demonstrated failing correctness test and
full native transport confirmation. Update README/Unreleased CHANGELOG and run
tests/coverage, types, lint, build/package/Zero-Three, and exact-head CI.
