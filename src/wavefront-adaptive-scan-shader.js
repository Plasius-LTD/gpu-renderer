// Shared workgroup prefix/scatter; both callers own eligibility and bounds.
export const ADAPTIVE_PREFIX_SCAN_WGSL = `  prefix[lane.x] = eligible;
  workgroupBarrier();
  for (var offset = 1u; offset < 64u; offset = offset * 2u) {
    var previous = 0u;
    if (lane.x >= offset) { previous = prefix[lane.x - offset]; }
    workgroupBarrier();
    prefix[lane.x] = prefix[lane.x] + previous;
    workgroupBarrier();
  }
  if (lane.x == 63u) { destinationBase = atomicAdd(&control.count, prefix[63u]); }
  workgroupBarrier();
  if (eligible != 0u) {
    let destination = destinationBase + prefix[lane.x] - 1u;
    if (destination < arrayLength(&worklist.words)) { worklist.words[destination] = id.x; }
    else { atomicOr(&control.failure, 4u); }
  }`;
