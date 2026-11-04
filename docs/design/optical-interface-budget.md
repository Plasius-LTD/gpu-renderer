# Separate capped optical-interface budget

Historical prototype design. Its per-interface node/dispatch allocation and
1–64 admission range are superseded by [ADR0067](../adrs/adr-0067-streamed-bounded-optical-chains.md)
and the [streamed design](streamed-optical-interface-budget.md). Preserve this
document to interpret the rejected prototype evidence, not as current allocation
or queue-depth guidance. The default-off separate-budget policy remains current.

27 October 2026. User approved the separate budget over raising every path's
ordinary bounce ceiling. Task234 / Story2291 / Feature2114; adaptive remains
paused. This design precedes implementation. Preserve the70e02d7 captures as
before-budget evidence, including failed furnace rows and strict-depth journals.

## Contract

- New remotely controllable flag `renderer.transport.opticalInterfaceBudget.enabled`,
  default off. Require bounded+nested transport, deferred resolve and strict
  physical lighting. Initially reject rough-bounce splitting (its lineage uses
  the same high ray-flag bits); no silently unsupported combination.
- Keep public `maxDepth` as the ordinary limit (1..32, unchanged semantics for
  pure ordinary paths). Add `opticalInterfaceBudget.maximumInterfaces` (1..64,
  default64) and `maximumAdditionalBytes` (default128MiB). Validate before GPU
  allocation. Only smooth, fully transmitting, valid-medium dielectric interfaces
  use the optical allowance, including Fresnel reflection and TIR. Partial,
  rough, diffuse, metal and coat events consume the ordinary budget.
- `ray.bounce` remains the actual absolute surface-event ordinal, incrementing
  at EVERY scattering. Use it unchanged for sample dimensions, queues and path
  node addresses. Camera-sample ordinals/counts/resolve never change. Pack the
  completed ordinary-event count in ray.flags bits24..31 (low flags preserved);
  optical count is physical ordinal minus ordinary count. Propagate it across
  compaction/continuations; never restart it at medium transitions.
- GPU maximum path events = ordinary maxDepth + optical maximumInterfaces,
  bounded by96. A final vertex still allows environment/emission before strict
  truncation. Ordinary cutoffs retain the preceding final-vertex semantics;
  optical continuation cannot grant extra diffuse/glossy scattering. Validate
  both counters and absolute cap; exhaustion never fabricates radiance.
- FrameConfig remains320 bytes. GPU maxDepth is the physical-event capacity;
  previously zero cameraUp.w stores the ordinary limit, cameraRight.w the optical
  allowance only when enabled. XYZ camera math is unchanged. A shared uniform
  validator admits >32 only with the flag, dependencies and matching finite
  integer limits. RayRecord remains96 bytes, PathNode64 bytes.
- Allocate tile-bounded PathNodes for physical capacity; queues, image buffers,
  counts and sample configuration sizes stay unchanged. Default128² tile at
  ordinary20 + optical64 adds64MiB of path-node allocation (not physical VRAM
  residency). Enforce both the configurable extra-allocation cap and device
  storage-buffer limit before allocation. No optical/adaptive allocation when
  disabled; preserve old payload bytes/outputs and dispatch counts.
- Dispatch/telemetry use physical capacity and count all actual optical segments.
  Report ordinary limit, optical allowance, physical cap and additional allocated
  bytes separately. No “free bounce”, hidden collision, ambient, transparent-shadow
  or zero-cost performance claim. No Three.js dependency or fallback.

## Requirements-first tests and qualification

Red tests: flag defaults/dependencies/type/limit validation; unchanged disabled
memory/payload/dispatch; exact extra bytes/admission; counter propagation and
mixed optical/ordinary limits; all-smooth TIR with no ordinary-budget consumption;
partial/rough/material exclusions; malformed counters/config; full path/count
normalization/identity and assembled WGSL ABI. Extend canonical original-history
diagnostics to the same bounded physical maximum, not an arbitrary larger limit.

Device preflight must execute the canonical budget helpers, sampler/BSDF and
captured TIR contract. Re-run known-radiance20/32 ordinary controls with64 optical
interfaces, retaining failed off-controls and frozen mean2%/row5% gates. Then run
all six native1080p/4K uniform32 lanes with explicit independent budget settings,
real physical event telemetry, HDR hashes/counts/preflight/cleanup. Failure or
missing evidence keeps adaptive and publication gates closed. CPU/reference or
independent Cycles controls must never be claimed to implement this policy unless
explicitly supported. Preserve them as independently labelled reference evidence.

Run tests/coverage, changed-file LCOV, lint, types/clean consumer, build/package,
Zero-Three, runtime audit, docs/README/Unreleased/ADR and exact-head CI. No release
or main/CD mutation without its approved workflow. Future queue/dispatch pruning
is separate performance work after correctness, not part of this policy fix.
