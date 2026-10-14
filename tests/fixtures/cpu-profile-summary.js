export function summarizeCpuValues(values) {
  if (!values.length || values.some(value => !Number.isFinite(value) || value < 0)) throw new RangeError("Missing or invalid CPU measurement");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return { count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1], min: sorted[0], max: sorted.at(-1) };
}

export function summarizeCpuLane(rows) {
  const off = rows.filter(row => !row.profileEnabled).sort((a,b) => a.round - b.round);
  const on = rows.filter(row => row.profileEnabled).sort((a,b) => a.round - b.round);
  if (!off.length || off.length !== on.length || off.some((row,i) => row.round !== on[i].round)
    || new Set(off.map(row => row.round)).size !== off.length) throw new Error("Unpaired CPU measurements");
  const stages = {};
  for (const name of new Set(on.flatMap(row => Object.keys(row.cpuProfile.stages)))) {
    stages[name] = { elapsedMs: summarizeCpuValues(on.map(row => row.cpuProfile.stages[name]?.elapsedMs ?? 0)),
      exclusiveMs: summarizeCpuValues(on.map(row => row.cpuProfile.stages[name]?.exclusiveMs ?? 0)) };
  }
  const field = name => ({ off: summarizeCpuValues(off.map(row => row[name])), on: summarizeCpuValues(on.map(row => row[name])),
    meanPairedDeltaMs: on.reduce((sum, row, i) => sum + row[name] - off[i][name], 0) / on.length });
  return { stages, job: field("linearOutputJobMs"),
    gpu: [...off, ...on].every(row => Number.isFinite(row.gpuMs) && row.gpuMs > 0) ? field("gpuMs") : null,
    commandCounts: on.map(row => row.cpuProfile.commands),
    knownTemporaryBuffers: on.map(row => row.cpuProfile.knownTemporaryBuffers),
    interpretation: "Signed on-minus-off elapsed time; noisy diagnostic, not a CPU utilization or performance qualification result" };
}
