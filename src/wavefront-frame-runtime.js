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
