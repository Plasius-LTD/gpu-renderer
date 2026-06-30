const DEFAULT_CAMERA = Object.freeze({
  mode: "lagged-follow",
  cubicBezier: [0.22, 0.61, 0.36, 1],
  lagMs: 240,
  lookAheadMs: 320,
  offset: [0, 2.4, 5.5],
});

function nowMs() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerp3(a, b, t) {
  return [
    lerp(a[0] ?? 0, b[0] ?? 0, t),
    lerp(a[1] ?? 0, b[1] ?? 0, t),
    lerp(a[2] ?? 0, b[2] ?? 0, t),
  ];
}

function bezierY([, y1, , y2], t) {
  const u = 1 - t;
  return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
}

function durationFromBeats(beats) {
  return beats.reduce((total, beat) => total + Math.max(0, beat.durationMs ?? 0), 0);
}

function definedCameraOverrides(camera) {
  if (!camera || typeof camera !== "object") {
    return {};
  }
  return Object.fromEntries(Object.entries(camera).filter(([, value]) => value !== undefined));
}

function resolveBeat(beats, loopTimeMs) {
  let cursor = 0;
  for (const beat of beats) {
    const durationMs = Math.max(1, beat.durationMs ?? 1);
    if (loopTimeMs < cursor + durationMs) {
      return { beat, beatTimeMs: loopTimeMs - cursor, durationMs };
    }
    cursor += durationMs;
  }
  const fallback = beats.at(-1);
  return { beat: fallback, beatTimeMs: fallback?.durationMs ?? 0, durationMs: fallback?.durationMs ?? 1 };
}

function resolveRoutePosition(route, timeMs) {
  if (!route.length) {
    return [0, 0, 0];
  }
  if (route.length === 1 || timeMs <= (route[0].arriveMs ?? 0)) {
    return [...route[0].position];
  }

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const next = route[index];
    const start = previous.arriveMs ?? 0;
    const end = next.arriveMs ?? start + 1;
    if (timeMs <= end) {
      return lerp3(previous.position, next.position, clamp01((timeMs - start) / Math.max(1, end - start)));
    }
  }

  return [...route.at(-1).position];
}

function resolveCanvas(canvas) {
  if (typeof canvas === "string") {
    const found = globalThis.document?.querySelector?.(canvas);
    if (!found) {
      throw new Error(`Animated scene canvas '${canvas}' was not found.`);
    }
    return found;
  }
  if (!canvas) {
    throw new Error("Animated scene renderer requires a canvas.");
  }
  return canvas;
}

function project(position, cameraPosition, width, height) {
  const x = position[0] - cameraPosition[0];
  const z = position[2] - cameraPosition[2];
  const scale = Math.max(24, 90 / Math.max(1, Math.abs(z) * 0.25 + 1));
  return [
    width * 0.5 + x * scale,
    height * 0.62 + z * scale * 0.45 - position[1] * scale,
    scale,
  ];
}

function drawProp(ctx, prop, cameraPosition, width, height) {
  const [x, y, scale] = project(prop.position, cameraPosition, width, height);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, scale * 0.04);

  if (prop.kind === "crop-row") {
    ctx.strokeStyle = "#4f6f32";
    ctx.beginPath();
    ctx.moveTo(-scale * 0.8, 0);
    ctx.lineTo(scale * 0.8, 0);
    ctx.stroke();
    ctx.fillStyle = "#6f9f43";
    for (let i = -3; i <= 3; i += 1) {
      ctx.fillRect(i * scale * 0.22, -scale * 0.18, scale * 0.06, scale * 0.2);
    }
  } else if (prop.kind === "fence-segment") {
    ctx.strokeStyle = "#896b4d";
    ctx.beginPath();
    ctx.moveTo(-scale * 0.5, 0);
    ctx.lineTo(scale * 0.5, 0);
    ctx.moveTo(-scale * 0.35, -scale * 0.25);
    ctx.lineTo(-scale * 0.35, scale * 0.1);
    ctx.moveTo(scale * 0.35, -scale * 0.25);
    ctx.lineTo(scale * 0.35, scale * 0.1);
    ctx.stroke();
  } else if (prop.kind === "cart") {
    ctx.fillStyle = "#7b5238";
    ctx.fillRect(-scale * 0.45, -scale * 0.28, scale * 0.9, scale * 0.32);
    ctx.fillStyle = "#25201c";
    ctx.beginPath();
    ctx.arc(-scale * 0.27, scale * 0.1, scale * 0.1, 0, Math.PI * 2);
    ctx.arc(scale * 0.27, scale * 0.1, scale * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === "small-tree") {
    ctx.fillStyle = "#5b3b24";
    ctx.fillRect(-scale * 0.05, -scale * 0.45, scale * 0.1, scale * 0.45);
    ctx.fillStyle = "#3f7a3d";
    ctx.beginPath();
    ctx.arc(0, -scale * 0.58, scale * 0.24, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = prop.kind === "crate" ? "#9a6a3d" : "#d0c39f";
    ctx.fillRect(-scale * 0.18, -scale * 0.18, scale * 0.36, scale * 0.36);
  }

  ctx.restore();
}

function drawCharacter(ctx, characterPosition, cameraPosition, width, height, gaitPhase) {
  const [x, y, scale] = project(characterPosition, cameraPosition, width, height);
  const stride = Math.sin(gaitPhase * Math.PI * 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(2, scale * 0.05);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#34251f";
  ctx.fillStyle = "#9b5f48";

  ctx.beginPath();
  ctx.arc(0, -scale * 1.15, scale * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#57413a";
  ctx.beginPath();
  ctx.moveTo(0, -scale * 0.95);
  ctx.lineTo(0, -scale * 0.45);
  ctx.moveTo(0, -scale * 0.82);
  ctx.lineTo(-scale * 0.25, -scale * (0.58 + stride * 0.08));
  ctx.moveTo(0, -scale * 0.82);
  ctx.lineTo(scale * 0.25, -scale * (0.58 - stride * 0.08));
  ctx.moveTo(0, -scale * 0.45);
  ctx.lineTo(-scale * 0.18, -scale * (0.05 - stride * 0.12));
  ctx.moveTo(0, -scale * 0.45);
  ctx.lineTo(scale * 0.18, -scale * (0.05 + stride * 0.12));
  ctx.stroke();

  ctx.fillStyle = "#496b8f";
  ctx.fillRect(-scale * 0.17, -scale * 0.9, scale * 0.34, scale * 0.42);
  ctx.restore();
}

function renderScene(canvas, ctx, snapshot, props) {
  const width = canvas.width || 1;
  const height = canvas.height || 1;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#d8e8d0";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#9fc47a";
  ctx.fillRect(0, height * 0.52, width, height * 0.48);
  ctx.strokeStyle = "#caa66d";
  ctx.lineWidth = Math.max(2, width * 0.006);
  ctx.beginPath();
  ctx.moveTo(width * 0.35, height);
  ctx.quadraticCurveTo(width * 0.53, height * 0.58, width * 0.62, 0);
  ctx.stroke();

  for (const prop of props) {
    drawProp(ctx, prop, snapshot.cameraPosition, width, height);
  }
  drawCharacter(ctx, snapshot.characterPosition, snapshot.cameraPosition, width, height, snapshot.clipTimeMs / 900);
}

export function createAnimatedSceneRenderer(options = {}) {
  const canvas = resolveCanvas(options.canvas);
  const ctx = canvas.getContext?.("2d");
  if (!ctx) {
    throw new Error("Animated scene renderer requires a 2D canvas context.");
  }

  const route = [...(options.route ?? options.animationAdventure?.route ?? [])];
  const beats = [...(options.beats ?? options.animationAdventure?.beats ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const props = [...(options.props ?? options.animationAdventure?.props ?? [])];
  const camera = Object.freeze({
    ...DEFAULT_CAMERA,
    ...definedCameraOverrides(options.camera ?? options.animationAdventure?.camera),
  });
  const loopDurationMs = Math.max(durationFromBeats(beats), route.at(-1)?.arriveMs ?? 1, 1);
  const requestFrame = options.requestAnimationFrame ?? globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame?.bind(globalThis);
  let frameHandle;
  let running = false;
  let frame = 0;
  let startedAtMs;
  let lastTimestamp;
  let cameraPosition = route[0]
    ? [
        route[0].position[0] + (camera.offset?.[0] ?? 0),
        route[0].position[1] + (camera.offset?.[1] ?? 0),
        route[0].position[2] + (camera.offset?.[2] ?? 0),
      ]
    : [0, 2.4, 5.5];
  let snapshot = {
    frame,
    running,
    activeClipId: beats[0]?.clipId ?? "",
    activeBeatId: beats[0]?.id ?? "",
    blendProgress: 0,
    clipTimeMs: 0,
    characterPosition: route[0]?.position ? [...route[0].position] : [0, 0, 0],
    cameraPosition: [...cameraPosition],
    frameState: "initialized",
  };

  function renderOnce(timestamp = nowMs()) {
    if (startedAtMs === undefined) {
      startedAtMs = timestamp;
    }
    const elapsedMs = Math.max(0, timestamp - startedAtMs);
    const loopTimeMs = elapsedMs % loopDurationMs;
    const frameTimeMs = lastTimestamp === undefined ? 16.67 : Math.max(0, timestamp - lastTimestamp);
    lastTimestamp = timestamp;
    frame += 1;

    const { beat, beatTimeMs, durationMs } = resolveBeat(beats, loopTimeMs);
    const blend = beat?.blend ?? { inMs: 0, outMs: 0 };
    const blendIn = blend.inMs > 0 ? clamp01(beatTimeMs / blend.inMs) : 1;
    const blendOut = blend.outMs > 0 ? clamp01((durationMs - beatTimeMs) / blend.outMs) : 1;
    const blendProgress = clamp01(Math.min(blendIn, blendOut));
    const characterPosition = resolveRoutePosition(route, loopTimeMs);
    const lookAheadPosition = resolveRoutePosition(route, loopTimeMs + camera.lookAheadMs);
    const desiredCamera = [
      lookAheadPosition[0] + (camera.offset?.[0] ?? 0),
      lookAheadPosition[1] + (camera.offset?.[1] ?? 0),
      lookAheadPosition[2] + (camera.offset?.[2] ?? 0),
    ];
    const smoothing = bezierY(camera.cubicBezier, clamp01(frameTimeMs / Math.max(1, camera.lagMs)));
    cameraPosition = lerp3(cameraPosition, desiredCamera, smoothing);

    snapshot = {
      frame,
      running,
      activeClipId: beat?.clipId ?? "",
      activeBeatId: beat?.id ?? "",
      blendProgress,
      clipTimeMs: beatTimeMs,
      characterPosition,
      cameraPosition: [...cameraPosition],
      frameState: running ? "running" : "rendered-once",
    };

    renderScene(canvas, ctx, snapshot, props);
    return snapshot;
  }

  function tick(timestamp) {
    renderOnce(timestamp);
    if (running && requestFrame) {
      frameHandle = requestFrame(tick);
    }
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      snapshot = { ...snapshot, running: true, frameState: "running" };
      if (requestFrame) {
        frameHandle = requestFrame(tick);
      } else {
        renderOnce();
      }
    },
    resize(width, height, devicePixelRatio = 1) {
      const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      if (canvas.style) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      renderScene(canvas, ctx, snapshot, props);
    },
    renderOnce,
    getSnapshot() {
      return {
        ...snapshot,
        characterPosition: [...snapshot.characterPosition],
        cameraPosition: [...snapshot.cameraPosition],
      };
    },
    destroy() {
      running = false;
      if (frameHandle !== undefined && cancelFrame) {
        cancelFrame(frameHandle);
      }
      frameHandle = undefined;
      snapshot = { ...snapshot, running: false, frameState: "destroyed" };
    },
  };
}
