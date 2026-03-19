import { createGpuRenderer, supportsWebGpu } from "../src/index.js";

const canvas = document.querySelector("#scene");
const startBtn = document.querySelector("#start");
const stopBtn = document.querySelector("#stop");
const stepBtn = document.querySelector("#step");
const logEl = document.querySelector("#log");
const displayBadge = document.querySelector("#displayBadge");
const displayDetails = document.querySelector("#displayDetails");

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}`;
  logEl.textContent = `${entry}\n${logEl.textContent}`;
}

function setDisplayState(badge, details, tone = "info") {
  if (displayBadge) {
    displayBadge.textContent = badge;
    displayBadge.dataset.tone = tone;
  }
  if (displayDetails) {
    displayDetails.textContent = details;
    displayDetails.dataset.tone = tone;
  }
}

function setControlsEnabled(enabled) {
  startBtn.disabled = !enabled;
  stopBtn.disabled = !enabled;
  stepBtn.disabled = !enabled;
}

setControlsEnabled(false);

try {
  if (!supportsWebGpu()) {
    const secureHint = window.isSecureContext
      ? "WebGPU is unavailable in this browser or device."
      : "This page is not running in a secure context. Use localhost or HTTPS.";
    setDisplayState("Canvas inactive", secureHint, "error");
    log(`Renderer unavailable. ${secureHint}`);
  } else {
    const renderer = await createGpuRenderer({
      canvas,
      clearColor: "#143251",
    });

    renderer.resize(canvas.clientWidth || 960, 540, 1);
    setControlsEnabled(true);
    setDisplayState(
      "3D canvas ready",
      "WebGPU initialized. The canvas is mounted and ready to render.",
      "success"
    );
    log("Renderer initialized.");

    startBtn.addEventListener("click", () => {
      renderer.start();
      setDisplayState(
        "Rendering",
        "Live render loop is running on the 3D canvas.",
        "success"
      );
      log("Render loop started.");
    });

    stopBtn.addEventListener("click", () => {
      renderer.stop();
      setDisplayState(
        "Canvas idle",
        "Renderer is initialized, but the live loop is stopped.",
        "warn"
      );
      log("Render loop stopped.");
    });

    stepBtn.addEventListener("click", () => {
      const state = renderer.renderOnce();
      setDisplayState(
        "Single-frame render",
        `Rendered frame ${state.frame} on demand. The canvas remains mounted.`,
        "success"
      );
      log(`Rendered frame ${state.frame}.`);
    });
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  setDisplayState("Initialization failed", message, "error");
  setControlsEnabled(false);
  log(`Renderer initialization failed: ${message}`);
}
