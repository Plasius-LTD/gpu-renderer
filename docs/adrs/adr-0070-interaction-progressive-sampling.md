# ADR 0070: Interaction-responsive progressive sampling

Status: Accepted for experimental implementation; native qualification pending.

Feature [2367](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2367),
Story2368, renderer Task286. User direction4 November2026 explicitly extends
the prior within-frame-only scope. Keep ADR0069's provisional convergence status
and every earlier capture. Three.js is permanently prohibited, including rollback.

First complete one camera sample per pixel. Admit focus-directed optional work
using gpu-performance's immutable refinement plan and existing budget ceiling.
During stationarity, let all pixels catch up to the configured total, retaining
earned focus samples. This is stable-integrand radiance history, separate from
classification-only escape history. It introduces no reprojection or variance
stopping. Any changed view/integrand invalidates history; changing only allocation
focus does not. Initial total count is1..256 under the existing packed-count ABI.

Keep exact unweighted complete-path FP32 sums on GPU, indexed by full-screen
pixel, with per-pixel completed counts. Sibling paths remain one camera sample.
Reuse tile-bounded worklists, reflected records, canonical camera sampling and
unchanged optical/material transport. Absolute ordinals and configured sequence
period remain independent of batches, admitted ceilings and focus changes.

The progressive variant alone admits full-screen history under an explicit
default192MiB combined cap; the old128MiB default remains unchanged. At4K,
history plus packed counts uses158.20MiB before bounded scratch. Check actual
device binding limits and total admission before allocating. Report descriptor
bytes, not physical VRAM residency or an assumed memory saving.

One GPU job promise owns scratch at a time. Complete coverage before coherent
presentation; drain pending submissions before reset/disposal. Sticky GPU errors
invalidate publication. The experimental native adapter is distinct from released
consumer integration, and contains no production governor or rollout activation.
Keep the parent and foveation/stationary/performance controls independently off
by default in the site's remote registry. Disabling parent restores the retained
GPU-native implementation with no progressive buffers or pipelines.

Require requirements-first unit tests, assembled WGSL reflection/compilation,
native1080p/4K prefix identity against the same unpartitioned sequence, reset and
failure tests, bounded memory, source/build provenance, coverage and CI. Scheduling
cannot establish60Hz when mandatory coverage itself exceeds the budget. Keep
timing claims separate from diagnostics and matched-quality qualification.

See [design](../design/interaction-progressive-sampling.md).
