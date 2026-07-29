import {
  bindRendererToXrManager,
  createFeedbackGameDiagnosticSnapshot,
  type CreateFeedbackGameDiagnosticSnapshotInput,
  type RendererXrManager,
} from "../src/index.js";
import type { XrManager } from "@plasius/gpu-xr";

type Assert<Condition extends true> = Condition;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

declare const sharedInput: CreateFeedbackGameDiagnosticSnapshotInput;

const generatorResult = createFeedbackGameDiagnosticSnapshot({
  ...sharedInput,
  surfaceId: "site.generator",
});
const gpuDemoResult = createFeedbackGameDiagnosticSnapshot({
  ...sharedInput,
  surfaceId: "site.gpu-demo",
});

export type FeedbackRendererDiagnosticsTypeContract = [
  Assert<
    Equal<
      NonNullable<typeof generatorResult>["provenanceContractId"],
      "generator.renderer-diagnostics.v1"
    >
  >,
  Assert<
    Equal<
      NonNullable<typeof gpuDemoResult>["provenanceContractId"],
      "gpu-demo.renderer-diagnostics.v1"
    >
  >,
];

// @ts-expect-error player-system is intentionally excluded from diagnostics.
createFeedbackGameDiagnosticSnapshot({ ...sharedInput, surfaceId: "game.player-system" });

declare const xrManager: XrManager;
declare const rendererXrManager: RendererXrManager;

bindRendererToXrManager(
  { setXrActive() {} },
  xrManager,
  {
    onSessionStart(session) {
      session.addEventListener("end", () => {});
    },
  },
);

bindRendererToXrManager(
  { setXrActive() {} },
  rendererXrManager,
);
