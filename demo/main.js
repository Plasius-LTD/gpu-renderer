import { createGpuRenderer, supportsWebGpu } from "../src/index.js";

const canvas = document.querySelector("#scene");
const startBtn = document.querySelector("#start");
const stopBtn = document.querySelector("#stop");
const stepBtn = document.querySelector("#step");
const logEl = document.querySelector("#log");

function log(message) {
  const entry = `[${new Date().toISOString()}] ${message}`;
  logEl.textContent = `${entry}\n${logEl.textContent}`;
}

if (!supportsWebGpu()) {
  log("WebGPU unsupported in this browser/device.");
} else {
  const renderer = await createGpuRenderer({
    canvas,
    clearColor: "#143251",
  });

  renderer.resize(canvas.clientWidth || 960, 540, 1);
  log("Renderer initialized.");

  startBtn.addEventListener("click", () => {
    renderer.start();
    log("Render loop started.");
  });

  stopBtn.addEventListener("click", () => {
    renderer.stop();
    log("Render loop stopped.");
  });

  stepBtn.addEventListener("click", () => {
    const state = renderer.renderOnce();
    log(`Rendered frame ${state.frame}.`);
  });
}
