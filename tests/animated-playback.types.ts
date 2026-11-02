import { createAnimatedSceneRenderer } from "../src/index.js";

declare const canvas: HTMLCanvasElement;
const animation = createAnimatedSceneRenderer({ canvas });
animation.start();
animation.stop();
animation.setInspectionCamera({ position: [3, 2, 5], target: [0, 1, 0], fovYDegrees: 45 });
animation.start();
animation.destroy();
