# ADR 0032: Primary visibility has no competing NEE estimator

- Status: Implemented, physical qualification pending
- Date: 2026-09-13
- Task: gpu-renderer#212; Story: plasius-ltd-site#2168; Feature: #2114

## Context

Task 210's physical constant-white primary environment probe returned
0.993707537651062 instead of 1 at 32 actual samples. The primary ray initializes
its stored PDF to one, but no NEE estimator competes with camera visibility.
Applying a power heuristic at this terminal therefore attenuates direct source
visibility. The emissive terminal has the same eligibility defect.

## Decision

Use one shared `bounce > 0 && !delta` predicate for both terminal branches.
Preserve their existing secondary PDFs and power heuristic verbatim. This is a
fixed-renderer correctness correction, not adaptive policy or a radiance retune.
No public API, GPU allocation, sample sequence or dispatch change is introduced.

## Verification and consequences

Requirements-first assembled-source tests pin the remainder of the transport
to Task 210's shader hash. A physical fixture checks predicate execution,
environment/emissive visibility, metal and glass, raw completed counts and
linear radiance at 1/32/128 SPP in both resolve modes. Its references and 1e-5
absolute tolerance are fixed before physical execution. Broader HDR/noise and
stress qualification remains separate and cannot be inferred from these probes.

Keep adaptive flags off. CI and approved main/CD are required before release.
Rollback is a qualified GPU-native release, never a Three.js implementation.
