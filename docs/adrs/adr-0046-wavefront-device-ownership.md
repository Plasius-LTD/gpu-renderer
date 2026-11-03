# ADR 0046: Release the wavefront renderer’s owned GPU device

Status: Accepted. Tracking: Task #279, site Story #2360 / Feature #1170.

The wavefront factory always calls adapter.requestDevice; it has no borrowed-device
option. Allocation failure released that device, but normal disposal and one-shot
render completion destroyed buffers and textures without releasing the device.
Repeated setting changes could retain dedicated devices until browser collection.

Make destroy idempotent and release the owned device in a finally boundary after
resource cleanup. The one-shot helper inherits this ownership contract on success
and failure. Callers must await work they wish to retain before disposal. Explicit
additional device.destroy calls remain harmless but are unnecessary.

This closes a reproduced lifecycle gap. It does not establish the cause of the
previous intermittent invalid-external-Instance error. Product Studio also needs
bounded previews and an exclusive reference boundary in gpu-shared. Its full
128-SPP sample target, shading, materials and resource budgets remain unchanged.

Regression tests first failed for normal repeated mounts and one-shot success and
failure. Qualification must additionally exercise repeated live GPU setting changes,
reference completion and recovery before the consumer release is complete.

The consumer retains gpu-demo.scene-fidelity.enabled and its studio capability.
Rollback uses the existing flag or a reviewed dependency-pin revert via main CD.
