# Complete path ownership before adaptive integration

Task [210](https://github.com/Plasius-LTD/gpu-renderer/issues/210), Story 2168,
Feature 2114. This is a fixed-transport correctness prerequisite, not an adaptive
performance improvement. The adaptive parent flag remains off.

## Ownership

The old implementation addresses deferred vertices and radiance only by the
original tile pixel. Siblings retain that pixel identity and can concurrently
overwrite those locations. A camera sample needs a tree, not one shared chain.

Use a 64-byte record per queue slot and depth. Each invocation exclusively writes
its own record: direct and terminal radiance, completion/failure status, immutable
parent and child node indices, source pixel, sample ordinal and bounce depth.
Keep original tile pixel, full-screen pixel and temporary queue slot distinct.
Do not use floating-point atomics or an O(pixels × queue length) gather.

After all bounce passes, one invocation per root pixel walks its parent/child
tree with bounded traversal and constant traversal state, combines contributions
and commits one camera sample. No sibling can separately increment actual SPP.
Lineage checks reject cycles, missing nodes, stale ordinals, wrong owners and
failed queue reservations. A zero-radiance terminal is still a completed path;
an overflow is not a valid black sample. Never retry only successful pixels.

## Transport boundary

Continue to evaluate the canonical material, source, PDF/MIS, medium, ray-offset
and sampling-dimension functions. Carry each branch's own throughput to its own
terminal. Direct illumination stays separate from terminal illumination until
the root reduction. Both deferred and non-deferred modes must use single-writer
ownership; no runtime mode may retain the shared-address race.

Preserve the existing per-mode terminal sanitization order: deferred source
and complete branch radiance are capped before fixed sample weighting. This
change does not claim unclamped f32 HDR transport; that existing limitation and
HDR readback qualification remain separate work. Forward versus backward
floating-point multiplication order still needs image/energy qualification.

The current split predicate incorrectly includes delta metals, and the secondary
refraction ratio disagrees with primary refraction. Qualify those defects and
their corrections explicitly. Total internal reflection and branch weighting
are independent energy requirements, not justified by race-free arithmetic.
An overflowing bounded tree cannot be published as a successful frame. The
capacity policy must preserve energy or fail visibly; silently discarding a
sibling or accepting only the primary is prohibited.

## Memory and execution

Node storage remains tile/depth bounded, never proportional to full-frame SPP.
At 16,384 queued paths and eight depth levels, 64-byte nodes require 8 MiB;
account and admit the real allocation, including any retained guard record.
Device storage-binding limits constrain tile capacity. Preserve reusable queues
and configurations. Record additional traversal/dispatch cost before making any
performance claim; fewer primary rays do not imply lower allocated memory.

## Required evidence

First reproduce the old terminal collision on physical WebGPU using the actual
assembled WGSL helper, with sibling identity retained and unequal contributions.
Then test the final node ABI, complete-tree reduction, nested siblings, one-child
paths, legitimate black terminals, invalid lineage, depth and bounds failures.
Test actual dispatch integration, not only a CPU oracle. Reflect final assembled
WGSL and verify host allocation stride. Retain physical readbacks, linear-HDR
energy and noise evidence, overflow/device-failure behaviour and the approved
resolution/depth/SPP stress lanes. Historical rejected timing evidence is not
reused, image thresholds are not relaxed and no noise fix is asserted in advance.

Task 168/169 may only accept this producer after its applicable gates pass.
Update README, CHANGELOG and ADRs before release. Require local/package/Zero-Three
checks and post-push CI. Production publication uses approved CD only; rollback
is a qualified GPU-native version. Three.js is permanently prohibited.
