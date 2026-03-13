export type RendererColor = string | [number, number, number, number?];

export interface RendererFrameEvent {
  frame: number;
  frameId: string;
  frameTimeMs?: number;
  timestamp: number;
  device: GPUDevice;
  context: GPUCanvasContext;
  canvas: HTMLCanvasElement;
  xrActive: boolean;
}

export interface RendererSnapshot {
  running: boolean;
  frame: number;
  lastTimestamp: number;
  format: string;
  width: number;
  height: number;
  xrActive: boolean;
}

export interface RendererHooks {
  onFrameStart?: (event: RendererFrameEvent) => void;
  onBeforeEncode?: (event: {
    frame: number;
    frameNumber: number;
    frameId: string;
    frameTimeMs?: number;
    timestamp: number;
    device: GPUDevice;
    context: GPUCanvasContext;
    encoder: GPUCommandEncoder;
    pass: GPURenderPassEncoder;
    canvas: HTMLCanvasElement;
    xrActive: boolean;
  }) => void;
  onAfterSubmit?: (event: {
    frame: number;
    frameNumber: number;
    frameId: string;
    frameTimeMs?: number;
    timestamp: number;
    device: GPUDevice;
    context: GPUCanvasContext;
    canvas: HTMLCanvasElement;
    xrActive: boolean;
  }) => void;
  onFrameComplete?: (event: RendererFrameEvent) => void;
}

export interface CreateGpuRendererOptions extends RendererHooks {
  canvas?: HTMLCanvasElement | string;
  navigator?: Navigator | { gpu?: GPU };
  document?: Document;
  powerPreference?: GPUPowerPreference;
  alpha?: boolean;
  format?: GPUTextureFormat;
  clearColor?: RendererColor;
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
  frameIdFactory?: (event: {
    frame: number;
    timestamp: number;
    canvas: HTMLCanvasElement;
    xrActive: boolean;
  }) => string;
}

export interface GpuRenderer {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  device: GPUDevice;
  format: GPUTextureFormat | string;
  renderOnce(timestamp?: number): {
    frame: number;
    frameId: string;
    frameTimeMs?: number;
    timestamp: number;
  };
  start(): boolean;
  stop(): boolean;
  resize(cssWidth: number, cssHeight: number, devicePixelRatio?: number): {
    width: number;
    height: number;
  };
  setClearColor(value: RendererColor): [number, number, number, number];
  setXrActive(active: boolean): void;
  getSnapshot(): RendererSnapshot;
  bindXrManager(
    xrManager: {
      subscribe: (listener: (state: { activeSession: XRSession | null }) => void) => () => void;
      getState?: () => { activeSession: XRSession | null };
      store?: { getSnapshot: () => { activeSession: XRSession | null } };
    },
    bindOptions?: {
      onSessionStart?: (session: XRSession, renderer: GpuRenderer) => void;
      onSessionEnd?: (renderer: GpuRenderer) => void;
    }
  ): () => void;
  destroy(): void;
}

export function supportsWebGpu(options?: { navigator?: Navigator | { gpu?: GPU } }): boolean;

export function createGpuRenderer(options?: CreateGpuRendererOptions): Promise<GpuRenderer>;

export interface RendererDebugHooksOptions {
  debugSession: {
    recordFrame(sample: {
      frameId?: string;
      frameTimeMs: number;
      targetFrameTimeMs?: number;
      dropped?: boolean;
    }): boolean;
  };
  targetFrameTimeMs?: number;
  targetFrameRate?: number;
  getTargetFrameTimeMs?: (event: RendererFrameEvent) => number | undefined;
  onFrameStart?: (event: RendererFrameEvent & { owner: "renderer" }) => void;
  onFrameComplete?: (
    event: RendererFrameEvent & {
      owner: "renderer";
      targetFrameTimeMs?: number;
    }
  ) => void;
}

export function createRendererDebugHooks(
  options: RendererDebugHooksOptions
): Pick<RendererHooks, "onFrameStart" | "onFrameComplete">;

export function bindRendererToXrManager(
  renderer: Pick<GpuRenderer, "setXrActive">,
  xrManager: {
    subscribe: (listener: (state: { activeSession: XRSession | null }) => void) => () => void;
    getState?: () => { activeSession: XRSession | null };
    store?: { getSnapshot: () => { activeSession: XRSession | null } };
  },
  options?: {
    onSessionStart?: (session: XRSession, renderer: Pick<GpuRenderer, "setXrActive">) => void;
    onSessionEnd?: (renderer: Pick<GpuRenderer, "setXrActive">) => void;
  }
): () => void;

export const defaultRendererClearColor: readonly [number, number, number, number];
export const rendererDebugOwner: "renderer";
