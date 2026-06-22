export function createGpuParallelismCounters() {
  return {
    directDispatches: 0,
    directWorkgroups: 0,
    directShaderInvocations: 0,
    multiWorkgroupDispatches: 0,
    largestDirectWorkgroupsPerDispatch: 0,
    indirectDispatches: 0,
    estimatedIndirectWorkgroupsUpperBound: 0,
    estimatedIndirectShaderInvocationsUpperBound: 0,
    indirectDispatchesWithMultiWorkgroupCapacity: 0,
    largestEstimatedIndirectWorkgroupsPerDispatch: 0,
  }
}

function countDispatchWorkgroups(groups) {
  return groups.reduce((product, value) => {
    const numeric = Number(value ?? 1)
    const count = Number.isFinite(numeric) ? Math.max(1, Math.trunc(numeric)) : 1
    return product * count
  }, 1)
}

export function recordDirectDispatch(
  parallelism,
  groups,
  invocationsPerWorkgroup = 1
) {
  const workgroups = countDispatchWorkgroups(groups)
  parallelism.directDispatches += 1
  parallelism.directWorkgroups += workgroups
  parallelism.directShaderInvocations += workgroups * invocationsPerWorkgroup
  parallelism.largestDirectWorkgroupsPerDispatch = Math.max(
    parallelism.largestDirectWorkgroupsPerDispatch,
    workgroups
  )
  if (workgroups > 1) {
    parallelism.multiWorkgroupDispatches += 1
  }
}

export function recordIndirectDispatch(
  parallelism,
  estimatedWorkgroupsUpperBound,
  invocationsPerWorkgroup = 1
) {
  const workgroups = Math.max(1, Math.trunc(Number(estimatedWorkgroupsUpperBound) || 1))
  parallelism.indirectDispatches += 1
  parallelism.estimatedIndirectWorkgroupsUpperBound += workgroups
  parallelism.estimatedIndirectShaderInvocationsUpperBound +=
    workgroups * invocationsPerWorkgroup
  parallelism.largestEstimatedIndirectWorkgroupsPerDispatch = Math.max(
    parallelism.largestEstimatedIndirectWorkgroupsPerDispatch,
    workgroups
  )
  if (workgroups > 1) {
    parallelism.indirectDispatchesWithMultiWorkgroupCapacity += 1
  }
}

export function createGpuParallelismDiagnostics(adapterDiagnostics, counters) {
  const totalEstimatedWorkgroupsUpperBound =
    counters.directWorkgroups + counters.estimatedIndirectWorkgroupsUpperBound
  const totalEstimatedShaderInvocationsUpperBound =
    counters.directShaderInvocations +
    counters.estimatedIndirectShaderInvocationsUpperBound
  const exposesMultiWorkgroupParallelism =
    counters.multiWorkgroupDispatches > 0 ||
    counters.indirectDispatchesWithMultiWorkgroupCapacity > 0
  return Object.freeze({
    ...adapterDiagnostics,
    directDispatches: counters.directDispatches,
    directWorkgroups: counters.directWorkgroups,
    directShaderInvocations: counters.directShaderInvocations,
    multiWorkgroupDispatches: counters.multiWorkgroupDispatches,
    largestDirectWorkgroupsPerDispatch: counters.largestDirectWorkgroupsPerDispatch,
    indirectDispatches: counters.indirectDispatches,
    estimatedIndirectWorkgroupsUpperBound: counters.estimatedIndirectWorkgroupsUpperBound,
    estimatedIndirectShaderInvocationsUpperBound:
      counters.estimatedIndirectShaderInvocationsUpperBound,
    indirectDispatchesWithMultiWorkgroupCapacity:
      counters.indirectDispatchesWithMultiWorkgroupCapacity,
    largestEstimatedIndirectWorkgroupsPerDispatch:
      counters.largestEstimatedIndirectWorkgroupsPerDispatch,
    totalEstimatedWorkgroupsUpperBound,
    totalEstimatedShaderInvocationsUpperBound,
    exposesMultiWorkgroupParallelism,
    likelyUsesMoreThanOnePhysicalGpuCore: null,
    coreUtilizationStatus: "not-exposed-by-webgpu",
  })
}

export function createGpuWorkerJobDiagnostics(
  parallelism,
  commandSubmissions,
  frameTimeMs,
  awaitedGpuCompletion
) {
  const directDispatchesCompleted = Math.max(0, Number(parallelism?.directDispatches ?? 0))
  const indirectDispatchesCompleted = Math.max(
    0,
    Number(parallelism?.indirectDispatches ?? 0)
  )
  const completedPerFrame = directDispatchesCompleted + indirectDispatchesCompleted
  const completedPerSubmission =
    commandSubmissions > 0 ? completedPerFrame / commandSubmissions : completedPerFrame
  const completedPerSecond =
    awaitedGpuCompletion && frameTimeMs > 0 ? (completedPerFrame * 1000) / frameTimeMs : null
  return Object.freeze({
    completedPerFrame,
    completedPerSecond,
    completedPerSubmission,
    directDispatchesCompleted,
    indirectDispatchesCompleted,
    frameTimeMs,
    awaitedGpuCompletion,
  })
}

export const defaultWavefrontTransportGuardrailThresholds = Object.freeze({
  maxPerJobRegressionRatio: 0.1,
})

function summarizeWavefrontMemory(memory) {
  const entries = Object.entries(memory ?? {}).filter(
    ([key, value]) => key.endsWith("Bytes") && Number.isFinite(value)
  )
  const totalBytes = entries.reduce((total, [, value]) => total + Number(value), 0)
  return Object.freeze({
    totalBytes,
    breakdown: memory ?? null,
  })
}

function normalizeDeviceLossStatus(status, awaitedGpuCompletion) {
  if (status === "lost") {
    return "lost"
  }
  if (status === "not-exposed") {
    return "not-exposed"
  }
  if (status === "pending") {
    return "pending"
  }
  return awaitedGpuCompletion ? "not-detected" : "pending"
}

function createTransportGuardrailCheck(id, status, details) {
  return Object.freeze({
    id,
    status,
    details,
  })
}

export function createWavefrontTransportGuardrailSummary(frameStats, options = {}) {
  const workerJobs = frameStats?.gpuWorkerJobs ?? {}
  const commandSubmissions = Math.max(0, Number(frameStats?.commandSubmissions ?? 0))
  const completedPerFrame = Math.max(0, Number(workerJobs.completedPerFrame ?? 0))
  const completedPerSecond =
    Number.isFinite(workerJobs.completedPerSecond) && workerJobs.completedPerSecond > 0
      ? Number(workerJobs.completedPerSecond)
      : null
  const completedPerSubmission =
    commandSubmissions > 0
      ? completedPerFrame / commandSubmissions
      : Math.max(0, Number(workerJobs.completedPerSubmission ?? completedPerFrame))
  const frameTimeMs = Math.max(0, Number(workerJobs.frameTimeMs ?? 0))
  const awaitedGpuCompletion = workerJobs.awaitedGpuCompletion !== false
  const queueOverflow = Math.max(0, Number(frameStats?.queueOverflow ?? 0))
  const maxFramePassesPerSubmission = Math.max(
    0,
    Number(frameStats?.maxFramePassesPerSubmission ?? 0)
  )
  const deviceLossStatus = normalizeDeviceLossStatus(
    options.deviceLossStatus ?? frameStats?.deviceLossStatus,
    awaitedGpuCompletion
  )
  const memory = summarizeWavefrontMemory(frameStats?.memory)
  const checks = Object.freeze([
    createTransportGuardrailCheck(
      "device-loss",
      deviceLossStatus === "lost" ? "fail" : deviceLossStatus === "pending" ? "warn" : "pass",
      deviceLossStatus === "lost"
        ? "The WebGPU device was lost during or immediately after the frame."
        : deviceLossStatus === "pending"
          ? "GPU work was not awaited, so device-loss status is still pending."
          : deviceLossStatus === "not-exposed"
            ? "This environment does not expose device-lost diagnostics."
            : "No device loss was detected for this frame."
    ),
    createTransportGuardrailCheck(
      "queue-overflow",
      queueOverflow > 0 ? "warn" : "pass",
      queueOverflow > 0
        ? `Queue overflow terminated ${queueOverflow} paths during the frame.`
        : "No queue-overflow termination was recorded."
    ),
    createTransportGuardrailCheck(
      "submission-batching",
      commandSubmissions <= 0
        ? "warn"
        : maxFramePassesPerSubmission > 1 && completedPerSubmission <= 1
          ? "warn"
          : "pass",
      commandSubmissions <= 0
        ? "No command submissions were recorded for the frame."
        : maxFramePassesPerSubmission > 1 && completedPerSubmission <= 1
          ? `Only ${completedPerSubmission.toFixed(2)} GPU jobs completed per command submission despite a ${maxFramePassesPerSubmission}-pass ceiling.`
          : `${completedPerFrame} GPU jobs completed across ${commandSubmissions} command submissions (${completedPerSubmission.toFixed(2)} jobs/submission).`
    ),
  ])
  const status = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "warn"
      : "pass"
  return Object.freeze({
    status,
    thresholds: defaultWavefrontTransportGuardrailThresholds,
    current: Object.freeze({
      jobsPerFrame: completedPerFrame,
      jobsPerSecond: completedPerSecond,
      jobsPerSubmission: completedPerSubmission,
      commandSubmissions,
      frameTimeMs,
      awaitedGpuCompletion,
      maxFramePassesPerSubmission,
      queueOverflow,
      deviceLossStatus,
      memory,
    }),
    checks,
  })
}

export function createGpuSubmissionBatcher({
  device,
  frameIndex,
  maxFramePassesPerSubmission,
  startingSubmissionCount = 0,
  labelPrefix = "plasius.wavefront.frame",
}) {
  let encodedFramePasses = 0
  let submissionCount = 0
  let encoder = createCommandEncoder()

  function createCommandEncoder() {
    return device.createCommandEncoder({
      label: `${labelPrefix}.${frameIndex}.batched.${startingSubmissionCount + submissionCount + 1}`,
    })
  }

  function submitCurrentEncoder() {
    if (encodedFramePasses <= 0) {
      return false
    }
    device.queue.submit([encoder.finish()])
    submissionCount += 1
    encodedFramePasses = 0
    encoder = createCommandEncoder()
    return true
  }

  return Object.freeze({
    reserve(passCount = 1) {
      if (
        encodedFramePasses > 0 &&
        encodedFramePasses + passCount > maxFramePassesPerSubmission
      ) {
        submitCurrentEncoder()
      }
      encodedFramePasses += passCount
      return encoder
    },
    flush() {
      submitCurrentEncoder()
      return submissionCount
    },
    getSubmissionCount() {
      return submissionCount
    },
  })
}
