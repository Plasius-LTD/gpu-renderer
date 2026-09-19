# ADR 0038: Prepared-sample command coordinator

- Status: Accepted (internal, not publicly enabled)
- Date: 2026-09-19
- Task: gpu-renderer#169
- Parent: plasius-ltd-site#2114 / Story #2119

## Context

The bootstrap, compacted camera generator and prepared continuation entry must
execute in order with coherent immutable tile/frame bindings. Duplicating this
ordering in future callers would risk regenerating dense rays or missing resets.

## Decision

Compose the existing three stages in a default-disabled internal encoder. Validate
host tile/offset inputs before any commands, snapshot the current bindings once
per sample and propagate failures. Reuse existing GPU resources. Do not submit,
read back, present or commit completed counts here. The caller must discard
unfinished command buffers after an exception and keep configuration/worklists
immutable throughout GPU consumption.

The unchanged fixed entry remains the only public dispatcher. The coordinator
adds no shader, buffer, public API or competing budget governor. Its optional
command accounting includes two bootstrap passes and indirect primary generation;
these are invocation upper bounds, not measurements of actual traced rays.

## Qualification and consequences

Unit tests cover disabled no-touch behavior, exact stage order through the shared
bounce loop at depths 1/4/8/32, refreshed bindings, validation before commands,
offsets and propagated failures. The physical probe observes native resources
created by the actual production renderer without replacing descriptors or GPU
objects, then compares selected deferred primary-miss path records with dense
dispatch. It uses a real uploaded mesh BVH with geometry behind the camera.

That probe is not a complete-sample producer, image correctness or speedup test.
Race-free reflection/transmission ownership, the tracked primary-source MIS fix,
complete-count integration, full assembled reflection with the approved shader
package release, scene/image/device qualification and CI remain required before
live adaptation. All release flags remain off. Three.js is permanently prohibited;
the only rollback is fixed GPU-native rendering.
