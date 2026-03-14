# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - 2026-02-10

- Initial scaffold for `@plasius/gpu-renderer`.
- Added framework-agnostic WebGPU renderer lifecycle APIs.
- Added XR manager binding helper to integrate with `@plasius/gpu-xr`.
- Added unit tests, demo, and ADR documentation.

## [Unreleased]

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.7] - 2026-03-14

- **Added**
  - Added frame lifecycle hooks and frame-id generation support to
    `createGpuRenderer(...)`.
  - Added `createRendererDebugHooks(...)` for opt-in `@plasius/gpu-debug`
    frame sampling tied to negotiated frame targets.
  - Added ADR, TDR, and design docs for renderer frame hook integration.
  - Added renderer worker profile and manifest exports for `realtime` and `xr`
    DAG scheduling across `@plasius/gpu-worker` and
    `@plasius/gpu-performance`.
  - Added ADR, TDR, and design docs for renderer frame-stage DAG manifests.

- **Changed**
  - Clarified renderer guidance for adaptive frame targets and debug
    instrumentation.
  - Clarified that frame hooks cover correlation while worker manifests cover
    renderer stage scheduling.
  - Raised the minimum `@plasius/gpu-xr` dependency to `^0.1.7` so npm
    installs resolve the published adaptive XR session helpers by default.
  - Updated GitHub Actions workflows to run JavaScript actions on Node 24,
    refreshed core workflow action versions, and switched Codecov uploads to
    the Codecov CLI.

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.6] - 2026-03-04

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.2] - 2026-03-01

- **Added**
  - `lint`, `typecheck`, and security audit scripts for local and CI enforcement.

- **Changed**
  - CI now fails early on lint/typecheck/runtime dependency audit before build/test.

- **Fixed**
  - Pack-check regex cleanup to remove an unnecessary path escape.

- **Security**
  - Runtime dependency vulnerability checks are now enforced in CI.

## [0.1.1] - 2026-02-28

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.0] - 2026-02-11

- **Added**
  - Initial release.

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)
[0.1.1]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.1
[0.1.2]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.2
[0.1.6]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.6
[0.1.7]: https://github.com/Plasius-LTD/gpu-renderer/releases/tag/v0.1.7
