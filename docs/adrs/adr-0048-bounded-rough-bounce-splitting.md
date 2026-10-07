# ADR 0048: Bounded rough-bounce splitting

Status: experimental; default off, not production qualified.

Low camera-SPP can undersample the broad response of rough surfaces. Add a
separate `renderer.sampling.roughBounceSplitting.enabled` creation-time flag
instead of altering reflectance, denoising or increasing camera samples.

Use the existing binary path tree and GPU queues. Sample the existing complete
BSDF twice at eligible opaque, rough non-metals, with half throughput per child.
Keep parent direct lighting once and normalize all descendants as one camera
sample. Branch lineage decorrelates downstream lighting but never changes actual
pixel identity or the camera ordinal. The stable-pattern sampler is required;
the known shared-point correlation must not be mistaken for a splitting benefit.

Limit splitting to the first one or two absolute bounce indices. Beyond that,
use existing continuation. Admit 2x/4x tile queue and path storage before resource
creation, within a separate 128 MiB additional-allocation cap; overflow fails
the frame. Existing dielectric splitting is retained, not promised to fit any
arbitrary scene. Do not add host per-pixel decisions or extra bounce passes.

The off path retains exact shader bytes and allocations. Disable the child flag
and recreate to roll back; Three.js is permanently prohibited. Existing MIS
weights remain a partition of unity; sample-count-aware MIS optimization is
future work. More rays are a quality/cost experiment, not a performance claim.

See [design, frozen checks and limitations](../design/rough-bounce-splitting.md).
