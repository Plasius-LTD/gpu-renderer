# Task 199 — fixed-SPP zero-budget regression

Date: 7 September 2026. Task: [gpu-renderer#199](https://github.com/Plasius-LTD/gpu-renderer/issues/199).
Parent: [site Story 2168](https://github.com/Plasius-LTD/plasius-ltd-site/issues/2168),
Feature 2114. Base: `8d92bbb1276033db9c0e32144f212557204140d9`.

## Defect and correction

Before the correction, `frameTimeBudgetMs: 0` selected one SPP from a requested
32-SPP target. The helper regression and fake-WebGPU public `renderFrame`
regression both failed with `1 !== 32` before source was changed.

Only positive finite budgets now enable whole-frame reduction. Omitted, zero,
negative and non-finite values normalize to the disabled `null` state. A lower
minimum does not reduce the fixed target; positive-budget timing selection is
unchanged. No shader, material, PDF, MIS, accumulation or sampling code changed.
This restores the existing fixed contract, not a new architectural decision.

## Local evidence

- Node 24.14.0; 195 tests passed, none skipped.
- Combined line coverage: 95.26%; changed executable source
  `src/wavefront-frame-stats.js`: 100% lines, branches and functions in LCOV.
- Public fake-WebGPU regression verifies 32 ordinals, uniform weights of 1/32,
  2048 primary rays for 8×8, and no additional buffers or textures versus an
  omitted budget. This is scheduling evidence, not physical image evidence.
- Lint, typecheck including clean packed consumer, ESM/CJS build, package check,
  full source/dependency/artifact zero-Three gate and npm audit passed (zero
  reported vulnerabilities). The public type change is documentation-only.

## Outstanding qualification

Physical WebGPU recapture and the user's noisy scene remain unqualified.
The dedicated browser endpoint was unavailable. No image-quality, performance,
production-release or Feature-completion claim follows from these unit tests.
Post-push CI and applicable main/CD status must be checked separately before
closure. The corrected fixed path is unconditional, not an optimization flag.
