# TDR 0008: Animated inspection qualification

Requirement: direct camera interaction must change rendered geometry, preserve
animation time and release safely. See ADR 0045 and Task #272.

Test world-to-screen coordinates for orbit, truck, pan, dolly and lens changes;
test actual canvas path coordinates for an animated skinned GLB. Reject malformed
poses atomically, keep snapshots independent of caller mutation, clip geometry
behind the camera and verify null restores follow. Destroy must prevent new
draws. Runtime input qualification belongs to `gpu-shared` and the host browser.

Maintain package coverage, changed-source LCOV, type/build, lint, security and
public artifact gates. Publish through approved `cd.yml` on main and qualify the
published dependency in the site before closing the parent Story.

Live workspace qualification exposed a missing playback method in 0.2.59: site
tests had mocked `stop()` although the actual renderer did not export it. The
follow-up requires actual renderer tests for pause, resume without elapsed-time
jumps, repeated calls, inspection while stopped, and cancelled callbacks delivered
after a restart. A public type consumer must compile `stop()` and `start()`.
