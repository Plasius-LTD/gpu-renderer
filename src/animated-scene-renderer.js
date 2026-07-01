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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
  const depth = Math.max(0.2, cameraPosition[2] - (position[2] ?? 0));
  const scale = clamp(34 + 150 / (depth + 1.2), 34, 104);
  const groundY = height * 0.82 - depth * height * 0.045 - (position[1] ?? 0) * scale;
  return {
    x: width * 0.5 + x * scale,
    y: groundY,
    groundY,
    scale,
    depth,
    visible: groundY > -height * 0.2 && groundY < height * 1.18,
  };
}

function propIdentity(prop, index) {
  return prop.id ?? `${prop.kind}-${index}`;
}

function drawGroundShadow(ctx, scale) {
  ctx.fillStyle = "rgba(44, 38, 28, 0.18)";
  ctx.fillRect(-scale * 0.36, -scale * 0.035, scale * 0.72, scale * 0.07);
}

function drawProp(ctx, prop, cameraPosition, width, height) {
  const projected = project(prop.position, cameraPosition, width, height);
  const { x, y, scale } = projected;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1, scale * 0.04);

  if (prop.kind === "crop-row") {
    ctx.fillStyle = "#8b633f";
    ctx.fillRect(-scale * 1.05, -scale * 0.08, scale * 2.1, scale * 0.16);
    ctx.fillStyle = "#6f4a30";
    ctx.fillRect(-scale * 0.92, -scale * 0.035, scale * 1.84, scale * 0.07);
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
    drawGroundShadow(ctx, scale);
    ctx.fillStyle = "#7b5238";
    ctx.fillRect(-scale * 0.52, -scale * 0.38, scale * 1.04, scale * 0.36);
    ctx.fillStyle = "#a4774c";
    ctx.fillRect(-scale * 0.44, -scale * 0.32, scale * 0.88, scale * 0.08);
    ctx.fillStyle = "#25201c";
    ctx.beginPath();
    ctx.arc(-scale * 0.32, scale * 0.02, scale * 0.1, 0, Math.PI * 2);
    ctx.arc(scale * 0.32, scale * 0.02, scale * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.kind === "small-tree") {
    drawGroundShadow(ctx, scale);
    ctx.fillStyle = "#5b3b24";
    ctx.fillRect(-scale * 0.07, -scale * 0.56, scale * 0.14, scale * 0.56);
    ctx.fillStyle = "#2f6d3b";
    ctx.beginPath();
    ctx.arc(-scale * 0.16, -scale * 0.72, scale * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3f8746";
    ctx.beginPath();
    ctx.arc(scale * 0.13, -scale * 0.76, scale * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4f9a50";
    ctx.beginPath();
    ctx.arc(0, -scale * 0.98, scale * 0.26, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawGroundShadow(ctx, scale);
    ctx.fillStyle = prop.kind === "crate" ? "#9a6a3d" : "#d0c39f";
    ctx.fillRect(-scale * 0.2, -scale * 0.32, scale * 0.4, scale * 0.32);
    if (prop.kind === "crate") {
      ctx.strokeStyle = "#6e4829";
      ctx.beginPath();
      ctx.moveTo(-scale * 0.2, -scale * 0.16);
      ctx.lineTo(scale * 0.2, -scale * 0.16);
      ctx.moveTo(0, -scale * 0.32);
      ctx.lineTo(0, 0);
      ctx.stroke();
    }
  }

  ctx.restore();
  return projected;
}

function drawCharacter(ctx, characterPosition, cameraPosition, width, height, gaitPhase) {
  const projected = project(characterPosition, cameraPosition, width, height);
  const { x, y, scale } = projected;
  const stride = Math.sin(gaitPhase * Math.PI * 2);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(2, scale * 0.05);
  ctx.lineCap = "round";

  drawGroundShadow(ctx, scale);

  ctx.strokeStyle = "#4c2f25";
  ctx.beginPath();
  ctx.moveTo(-scale * 0.12, -scale * 0.34);
  ctx.lineTo(-scale * (0.18 + stride * 0.04), -scale * 0.02);
  ctx.moveTo(scale * 0.12, -scale * 0.34);
  ctx.lineTo(scale * (0.18 - stride * 0.04), -scale * 0.02);
  ctx.stroke();

  ctx.fillStyle = "#6f8f62";
  ctx.beginPath();
  ctx.moveTo(-scale * 0.3, -scale * 0.86);
  ctx.lineTo(scale * 0.3, -scale * 0.86);
  ctx.lineTo(scale * 0.42, -scale * 0.24);
  ctx.lineTo(-scale * 0.42, -scale * 0.24);
  ctx.lineTo(-scale * 0.3, -scale * 0.86);
  ctx.fill();

  ctx.fillStyle = "#d8b18c";
  ctx.beginPath();
  ctx.arc(0, -scale * 1.16, scale * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#5a3a2b";
  ctx.fillRect(-scale * 0.2, -scale * 1.28, scale * 0.4, scale * 0.16);
  ctx.fillRect(-scale * 0.23, -scale * 1.14, scale * 0.1, scale * 0.28);
  ctx.fillRect(scale * 0.13, -scale * 1.14, scale * 0.1, scale * 0.28);

  ctx.strokeStyle = "#6b4935";
  ctx.beginPath();
  ctx.moveTo(-scale * 0.24, -scale * 0.76);
  ctx.lineTo(-scale * (0.46 + stride * 0.04), -scale * (0.5 + stride * 0.06));
  ctx.moveTo(scale * 0.24, -scale * 0.76);
  ctx.lineTo(scale * (0.46 - stride * 0.04), -scale * (0.5 - stride * 0.06));
  ctx.stroke();

  ctx.fillStyle = "#d6c09a";
  ctx.fillRect(-scale * 0.16, -scale * 0.86, scale * 0.32, scale * 0.18);
  ctx.restore();
  return projected;
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

  const projectedProps = props
    .map((prop, index) => ({
      prop,
      id: propIdentity(prop, index),
      projected: project(prop.position, snapshot.cameraPosition, width, height),
    }))
    .sort((a, b) => b.projected.depth - a.projected.depth);

  const propGroundAnchors = [];
  for (const { prop, id } of projectedProps) {
    const projected = drawProp(ctx, prop, snapshot.cameraPosition, width, height);
    propGroundAnchors.push({
      id,
      kind: prop.kind,
      groundY: projected.groundY,
      depth: projected.depth,
      visible: projected.visible,
    });
  }
  const characterProjection = drawCharacter(ctx, snapshot.characterPosition, snapshot.cameraPosition, width, height, snapshot.clipTimeMs / 900);
  return {
    characterGroundY: characterProjection.groundY,
    characterVisible: characterProjection.visible,
    propGroundAnchors,
  };
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
    characterGroundY: 0,
    characterVisible: false,
    propGroundAnchors: [],
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
      characterGroundY: 0,
      characterVisible: false,
      propGroundAnchors: [],
      frameState: running ? "running" : "rendered-once",
    };

    const visibility = renderScene(canvas, ctx, snapshot, props);
    snapshot = {
      ...snapshot,
      ...visibility,
    };
    return snapshot;
  }

  function tick(timestamp) {
    if (!running) {
      return;
    }
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
      const visibility = renderScene(canvas, ctx, snapshot, props);
      snapshot = {
        ...snapshot,
        ...visibility,
      };
    },
    renderOnce,
    getSnapshot() {
      return {
        ...snapshot,
        characterPosition: [...snapshot.characterPosition],
        cameraPosition: [...snapshot.cameraPosition],
        propGroundAnchors: snapshot.propGroundAnchors.map((anchor) => ({ ...anchor })),
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
