# ADR 0023: Deterministic Low-SPP Indirect Transport

## Status

Superseded

## Context

Product Studio high-SPP renders converge to a useful path-traced reference, but
low-SPP renders can still show salt-and-pepper indirect lighting when multi-hop
continuation paths randomly find or miss physical sources. Direct source routing
has already been made deterministic, so the remaining visible stipple is mostly
from the one-random-path indirect estimate at very low SPP.

ADR 0023 originally accepted a fixed, deterministic two-probe cached indirect
estimate that replaced the first stochastic residual continuation. Production
validation showed that this made 1 SPP and 8 SPP renders look suspiciously
similar and could create shadows or reflections that had not been earned by the
actual path budget. That is not acceptable for strict physical validation.

A pure unbiased path tracer cannot provide exact global illumination at 1 SPP
for arbitrary scenes. Product validation still needs low-cost, repeatable,
physically auditable output that converges toward the high-SPP reference without
using denoise, ambient rescue, terminal fill, vertex brightness tricks, a cached
indirect shortcut, or a raster scene fallback.

## Decision

Keep `renderer.transport.deterministicLowSppIndirect.enabled` in the strict-mode
transport experiment matrix for API and production flag compatibility, but remove
its cached-indirect radiance contribution from the shader. When the flag is
requested, diagnostics may still report requested/effective flag state, but the
strict physical path must not:

- trace fixed indirect probes outside the normal wavefront path budget;
- add cached indirect radiance to `TRANSPORT_BUCKET_CACHED_INDIRECT`;
- record deterministic residual zero as a substitute for continuation; or
- return before normal BSDF continuation when bounce budget remains.

Direct explicit lighting, true terminal emissive/environment hits, strict zero
termination, and stochastic BSDF continuation remain the valid contribution
routes. A future low-SPP indirect stabilizer needs a new or revised ADR with
measured PDFs, visibility, composition behavior, and high-SPP convergence gates
before it is allowed to contribute radiance.

## Consequences

Low-SPP Product Studio output may become noisier again when indirect continuation
has too few samples, but that noise is honest Monte Carlo variance rather than a
fixed cached-lighting approximation. `cachedIndirectLuminance` should remain
zero until a replacement estimator is explicitly approved, and any shadows or
reflections visible at low bounce counts must be traceable to direct explicit
lighting, terminal sources, or actual continuation paths.

The renderer keeps the public feature flag and diagnostics stable, avoiding a
breaking API change while removing the misleading radiance path.

## Validation

Validation must include denoise-off Product Studio captures at SPP 1, 4, 20,
64, 128, and 256, with bounces 1, 6, and 20. Unit coverage must verify strict
flag gating, stable flag packing, absence of cached-indirect shader
contribution, contribution bucket accounting, finite PDFs/MIS weights, and
telemetry/checksum readback behavior.
