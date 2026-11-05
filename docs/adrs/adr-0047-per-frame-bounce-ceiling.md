# ADR 0047: Per-frame Wavefront Bounce Ceiling

Status: Accepted

Tracking: renderer #287 / site #2380.

The renderer's creation depth bounds resource admission. A preview can lower
that depth per frame to reduce dispatches and transport work without changing
scene resources. Use the same effective value in host scheduling, shader
uniforms, submission estimates, and frame diagnostics. Keep cost observations
for explicit depth values separate from the default path so a cheap shallow
preview or an expensive fixed reference does not mislead sample admission.

Callers still own the quality policy. Omission selects the configured depth and
retains fixed rendering. Do not mix differently truncated paths in progressive
radiance history. The override can change preview lighting; it is not a
matched-quality optimisation or a reduction of allocated GPU memory.
