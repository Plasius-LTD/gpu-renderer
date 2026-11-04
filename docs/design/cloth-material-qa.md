# Cloth material QA inventory — Task 224

Scope: transformed texture detail, independently flagged sheen, mapped-normal
reconstruction. No real-time, complete glTF conformance or white-paper claim.

Before signoff:

- Unit: original texture bytes; all slot matrices, UV selection, negative scale,
  rotation and wrapping; admission/allocation cleanup; roughness transfer,
  energy bounds and cached LUT; mapped-normal signal and noise rejection.
- Physical: complete assembled material WGSL, all transformed slots and sheen
  channel/CPU comparison; existing CPU/GPU builder parity, sidedness and normal
  checks; constant HDR, protected materials, noise RMSE and high-SPP normal detail.
- UI: sheen defaults off; on/off/reset round-trip clears stale capture; capture
  evidence and filenames identify state. Native resolution and ceiling remain
  adjustable. Raw/clean round-trip displays the same frame.
- Visual: retain sofa-centred 1.5 m geometry, FOV45, six bounces, original models;
  inspect native raw and cleaned detail, seams and silhouettes. Compare with the
  prior retained 4K/256 image; do not compare unrelated lighting as ground truth.
- Exploratory: invalid SPP rejected without work; fast sampler plus splitting
  rejected; cancellation restores usable controls. Check controls and result at
  normal window width for clipping and readable status. No private files committed.

Each physical/capture receipt must retain source commits, sample counts, flags,
failures, timings and memory inventory. Native scene captures are visual evidence,
not a substitute for matched-quality performance qualification. Browser remains
open for the user's comparison. CI and approved release gates remain separate.
