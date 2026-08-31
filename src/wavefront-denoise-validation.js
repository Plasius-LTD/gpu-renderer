const measuredMaterials = Object.freeze(["sheen", "chrome", "wood"]);

export const defaultHighSppDenoiseAcceptanceThresholds = Object.freeze({
  maxStructuralArtifactShare: 0,
  maxInvalidSampleShare: 0,
  maxNoiseVsBaselineRatio: 1,
  minDetailRetentionRatio: 0.92,
  measuredMaterials,
});

function readShare(name, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`${name} must be a non-negative finite number.`);
  }
  return numeric;
}

function readDetailContrast(source, material) {
  const numeric = Number(source?.[material]);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${material} detail contrast must be a positive finite number.`);
  }
  return numeric;
}

export function evaluateHighSppDenoiseAcceptance(
  report,
  thresholds = defaultHighSppDenoiseAcceptanceThresholds
) {
  const denoiseOffStructuralArtifactShare = readShare(
    "denoiseOff.structuralArtifactShare",
    report?.denoiseOff?.structuralArtifactShare
  );
  const denoiseOffInvalidSampleShare = readShare(
    "denoiseOff.invalidSampleShare",
    report?.denoiseOff?.invalidSampleShare
  );
  const denoiseOffNoise = readShare(
    "denoiseOff.luminanceStdDev",
    report?.denoiseOff?.luminanceStdDev
  );
  const baselineNoise = readShare(
    "baselineDenoiseOff.luminanceStdDev",
    report?.baselineDenoiseOff?.luminanceStdDev
  );
  const denoiseOnStructuralArtifactShare = readShare(
    "denoiseOn.structuralArtifactShare",
    report?.denoiseOn?.structuralArtifactShare
  );

  const failures = [];
  if (denoiseOffStructuralArtifactShare > thresholds.maxStructuralArtifactShare) {
    failures.push(
      `denoise-off structural artifact share ${denoiseOffStructuralArtifactShare} exceeded ${thresholds.maxStructuralArtifactShare}.`
    );
    if (denoiseOnStructuralArtifactShare <= thresholds.maxStructuralArtifactShare) {
      failures.push("denoise-on output cannot mask a failing denoise-off structural artifact.");
    }
  }
  if (denoiseOffInvalidSampleShare > thresholds.maxInvalidSampleShare) {
    failures.push(
      `denoise-off invalid sample share ${denoiseOffInvalidSampleShare} exceeded ${thresholds.maxInvalidSampleShare}.`
    );
  }

  const noiseVsBaselineRatio = baselineNoise === 0 ? 1 : denoiseOffNoise / baselineNoise;
  if (noiseVsBaselineRatio > thresholds.maxNoiseVsBaselineRatio) {
    failures.push(
      `denoise-off noise ratio ${noiseVsBaselineRatio.toFixed(4)} exceeded ${thresholds.maxNoiseVsBaselineRatio}.`
    );
  }

  const detailRetention = Object.fromEntries(
    thresholds.measuredMaterials.map((material) => {
      const denoiseOffDetail = readDetailContrast(report?.denoiseOff?.detailContrast, material);
      const denoiseOnDetail = readDetailContrast(report?.denoiseOn?.detailContrast, material);
      const retentionRatio = denoiseOnDetail / denoiseOffDetail;
      if (retentionRatio < thresholds.minDetailRetentionRatio) {
        failures.push(
          `${material} detail retention ${retentionRatio.toFixed(4)} fell below ${thresholds.minDetailRetentionRatio}.`
        );
      }
      return [material, retentionRatio];
    })
  );

  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    denoiseOffStructuralArtifactShare,
    denoiseOffInvalidSampleShare,
    noiseVsBaselineRatio,
    detailRetention: Object.freeze(detailRetention),
  });
}
