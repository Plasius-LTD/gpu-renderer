import { describe, test } from "node:test";

describe("ray-tracing-first renderer contract", () => {
  test.todo(
    "will consume a stable visual snapshot boundary instead of in-flight simulation state"
  );
  test.todo(
    "will publish an explicit render ordering for primary visibility, shadow assist, opaque foundation, RT lighting, RT reflections, RT GI, denoise, transparents, composition, and present"
  );
  test.todo(
    "will expose near, mid, far, and horizon representation bands for renderer planning"
  );
});

describe("ray-tracing-first renderer unit planning", () => {
  test.todo(
    "will classify acceleration-structure updates for static, rigid-dynamic, deforming, and proxy representations"
  );
  test.todo(
    "will retain premium RT participation for near-field content while allowing cheaper proxy or cached distant representations"
  );
  test.todo(
    "will treat temporal accumulation and denoising as required frame stages rather than optional post effects"
  );
});
