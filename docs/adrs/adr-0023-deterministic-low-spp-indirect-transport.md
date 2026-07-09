# ADR 0023: Deterministic Low-SPP Indirect Transport

## Status

Accepted

## Context

Product Studio high-SPP renders converge to a useful path-traced reference, but
low-SPP renders can still show salt-and-pepper indirect lighting when multi-hop
continuation paths randomly find or miss physical sources. Direct source routing
has already been made deterministic, so the remaining visible stipple is mostly
from the one-random-path indirect estimate at very low SPP.

A pure unbiased path tracer cannot provide exact global illumination at 1 SPP
for arbitrary scenes. Product validation still needs low-cost, repeatable,
physically auditable output that converges toward the high-SPP reference without
using denoise, ambient rescue, terminal fill, vertex brightness tricks, or a
raster scene fallback.

## Decision

Add `renderer.transport.deterministicLowSppIndirect.enabled` as a strict-mode
transport experiment. When enabled at very low SPP, the wavefront resolver
replaces the first stochastic residual indirect continuation with a deterministic
surface radiance probe cache. The cache:

- derives samples from stable surface position, normal, and fixed
  low-discrepancy directions rather than frame index;
- stores radiance from visible explicit lights, environment, emissive geometry,
  and first low-order bounce visibility;
- contributes through a named cached-indirect bucket with finite transport
  accounting;
- reports suppressed residual continuation as a zero termination; and
- emits direct, cached indirect, residual, terminal-zero, and checksum
  diagnostics.

The flag also makes deterministic direct-light evaluation effectively active
while strict physical transport is enabled. This ensures the indirect cache is
stable when the new flag is used alone.

## Consequences

Low-SPP Product Studio output becomes coherent and repeatable without requiring
denoise. Remaining variation is split into explicit buckets so stipple can be
attributed to residual Monte Carlo paths instead of hidden presentation effects.

The cache is a biased low-SPP transport approximation, not an exact global
illumination solve. The acceptance criterion is deterministic, auditable
low-SPP behavior that visually approaches the existing high-SPP path-traced
result as SPP increases.

## Validation

Validation must include denoise-off Product Studio captures at SPP 1, 4, 20,
64, 128, and 256, with bounces 1, 6, and 20. Unit coverage must verify strict
flag gating, stable flag packing, deterministic shader-path isolation,
contribution bucket accounting, finite PDFs/MIS weights, and telemetry/checksum
readback behavior.
