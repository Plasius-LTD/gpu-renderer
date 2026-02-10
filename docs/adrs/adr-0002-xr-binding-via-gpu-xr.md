# ADR 0002: XR Binding Via @plasius/gpu-xr

- Status: Accepted
- Date: 2026-02-10

## Context

XR session management is now handled by `@plasius/gpu-xr`. The renderer package
must integrate with XR state without recreating duplicated session logic.

## Decision

Use `@plasius/gpu-xr` managers as the integration boundary and provide a thin
binding helper (`bindRendererToXrManager`) inside `@plasius/gpu-renderer`.

- Renderer tracks XR active state only.
- Session lifecycle ownership stays in `@plasius/gpu-xr`.
- App layers can attach custom callbacks on session start/end.

## Consequences

- Positive: clear separation of concerns between rendering and session lifecycle.
- Positive: avoids XR API lock-in to any one renderer implementation.
- Negative: consumers still need to bridge XR sessions into advanced render state.

## Alternatives Considered

- Embed full XR session management in renderer: Rejected due to duplicated concerns.
- No XR integration helper: Rejected because every consumer would duplicate glue code.
