#!/usr/bin/env node
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const packageRoot = resolve(__dirname, "..");
const packageManifest = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8")
);
const temporaryRoot = mkdtempSync(
  join(tmpdir(), "gpu-renderer-type-consumer-")
);
const packageDirectory = join(temporaryRoot, "packages");
const consumerDirectory = join(temporaryRoot, "consumer");
const cleanEnvironment = {
  ...process.env,
  npm_config_cache: join(temporaryRoot, "npm-cache"),
};
delete cleanEnvironment.NODE_AUTH_TOKEN;

try {
  mkdirSync(packageDirectory, { recursive: true });
  mkdirSync(consumerDirectory, { recursive: true });
  const sharedRoot = resolvePackageRoot(
    "@plasius/gpu-shared/package.json",
    packageRoot
  );
  const schemaRoot = resolvePackageRoot(
    "@plasius/schema/package.json",
    sharedRoot
  );
  const rendererTarball = packPackage(packageRoot);
  const sharedTarball = packPackage(sharedRoot);
  const schemaTarball = packPackage(schemaRoot);

  writeFileSync(
    join(consumerDirectory, "package.json"),
    JSON.stringify(
      {
        name: "gpu-renderer-clean-type-consumer",
        private: true,
        type: "module",
      },
      null,
      2
    )
  );
  writeFileSync(
    join(consumerDirectory, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022", "DOM"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
          types: [],
        },
        include: ["consumer.ts"],
      },
      null,
      2
    )
  );
  writeFileSync(
    join(consumerDirectory, "consumer.ts"),
    [
      'import type { XrManager } from "@plasius/gpu-xr";',
      "import {",
      "  bindRendererToXrManager,",
      "  createFeedbackGameDiagnosticSnapshot,",
      '} from "@plasius/gpu-renderer";',
      "",
      "declare const xrManager: XrManager;",
      "bindRendererToXrManager({ setXrActive() {} }, xrManager, {",
      "  onSessionStart(session) {",
      '    session.addEventListener("end", () => {});',
      "  },",
      "});",
      "",
      "createFeedbackGameDiagnosticSnapshot({",
      "  featureEnabled: true,",
      "  capabilityGranted: true,",
      "  consentConfirmed: true,",
      '  surfaceId: "site.gpu-demo",',
      '  renderer: "webgpu",',
      '  backend: "worker",',
      "  viewportWidth: 1920,",
      "  viewportHeight: 1080,",
      "  frameRate: 60,",
      "  frameTimeMs: 16,",
      '  featureIds: ["renderer.frame-loop"],',
      "  counters: [],",
      "  errorCodes: [],",
      "});",
      "",
    ].join("\n")
  );

  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--save-exact",
      rendererTarball,
      sharedTarball,
      schemaTarball,
    ],
    consumerDirectory
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--save-dev",
      "typescript@7.0.2",
    ],
    consumerDirectory
  );

  const consumerManifest = JSON.parse(
    readFileSync(join(consumerDirectory, "package.json"), "utf8")
  );
  if (
    consumerManifest.dependencies?.["@types/webxr"] !== undefined ||
    consumerManifest.devDependencies?.["@types/webxr"] !== undefined
  ) {
    throw new Error(
      "Clean consumer must not declare its own @types/webxr dependency."
    );
  }
  if (
    !existsSync(
      join(consumerDirectory, "node_modules", "@types", "webxr", "index.d.ts")
    )
  ) {
    throw new Error(
      "Packed renderer did not supply the transitive WebXR type dependency."
    );
  }
  const installedRendererManifest = JSON.parse(
    readFileSync(
      join(
        consumerDirectory,
        "node_modules",
        "@plasius",
        "gpu-renderer",
        "package.json"
      ),
      "utf8"
    )
  );
  const expectedWebXrTypeRange =
    packageManifest.dependencies?.["@types/webxr"];
  if (
    typeof expectedWebXrTypeRange !== "string" ||
    installedRendererManifest.dependencies?.["@types/webxr"] !==
      expectedWebXrTypeRange
  ) {
    throw new Error(
      "Packed renderer must declare its WebXR type dependency."
    );
  }

  run(
    join(consumerDirectory, "node_modules", ".bin", "tsc"),
    ["-p", "tsconfig.json", "--pretty", "false"],
    consumerDirectory
  );
  process.stdout.write("Clean packed-package type consumer passed.\n");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}

function resolvePackageRoot(packageJsonSpecifier, searchRoot) {
  const resolvedPackageJson = require.resolve(packageJsonSpecifier, {
    paths: [searchRoot],
  });
  return realpathSync(dirname(resolvedPackageJson));
}

function packPackage(root) {
  const result = run(
    "npm",
    [
      "pack",
      "--json",
      "--ignore-scripts",
      "--pack-destination",
      packageDirectory,
    ],
    root,
    true
  );
  const parsed = JSON.parse(result.stdout);
  const filename = Array.isArray(parsed) ? parsed[0]?.filename : undefined;
  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error("npm pack did not return a package filename.");
  }
  return join(packageDirectory, filename);
}

function run(command, args, cwd, captureOutput = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: cleanEnvironment,
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "pipe",
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join("\n");
    throw new Error(
      `${command} ${args.join(" ")} failed.${details ? `\n${details}` : ""}`
    );
  }
  return result;
}
