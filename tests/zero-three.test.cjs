"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ENGINE,
  digestEvidence,
  inspectInstalledGraph,
  inspectInstalledManifests,
  inspectPackageArtifact,
  inspectRepository,
  inspectSbom,
  isForbiddenPackageName,
  verifyEvidence,
} = require("../scripts/verify-zero-three.cjs");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zero-engine-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.mkdirSync(path.join(root, "docs", "adrs"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    files: ["src", "README.md"],
    name: "fixture",
    version: "1.0.0",
  }));
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3,
    name: "fixture",
    packages: { "": { name: "fixture", version: "1.0.0" } },
    version: "1.0.0",
  }));
  fs.writeFileSync(path.join(root, "src", "index.js"), "export const value = 1;\n");
  fs.writeFileSync(path.join(root, "README.md"), "GPU-native fixture.\n");
  return root;
}

test("classifies every prohibited direct, subpath, type, React, BVH, tracer, stdlib, and alias name", () => {
  const candidates = [
    ENGINE,
    `${ENGINE}/webgpu`,
    `@types/${ENGINE}`,
    `@react-${ENGINE}/fiber`,
    `${ENGINE}-mesh-bvh`,
    `${ENGINE}-gpu-pathtracer`,
    `${ENGINE}-stdlib`,
    `npm:${ENGINE}@1.0.0`,
    `pkg:npm/${ENGINE}@1.0.0`,
  ];
  for (const candidate of candidates) {
    assert.equal(isForbiddenPackageName(candidate), true, candidate);
  }
  assert.equal(isForbiddenPackageName("@plasius/gpu-renderer"), false);
});

test("rejects forbidden packages from every manifest dependency surface and aliases", () => {
  const root = fixture();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  manifest.dependencies = { [ENGINE]: "1.0.0" };
  manifest.devDependencies = { [`@types/${ENGINE}`]: "1.0.0" };
  manifest.peerDependencies = { [`@react-${ENGINE}/fiber`]: "1.0.0" };
  manifest.optionalDependencies = { [`${ENGINE}-mesh-bvh`]: "1.0.0" };
  manifest.overrides = { rendererAlias: `npm:${ENGINE}@1.0.0` };
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));

  const result = inspectRepository(root);
  assert.ok(result.violations.filter((entry) => entry.startsWith("package.json:")).length >= 5);
});

test("rejects lock nodes, imports, declarations, aliases, bundles, and active install guidance", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({
    packages: { [`node_modules/${ENGINE}`]: { version: "1.0.0" } },
  }));
  fs.writeFileSync(path.join(root, "src", "bad.js"), `import value from "${ENGINE}";\n`);
  fs.writeFileSync(path.join(root, "src", "side-effect.js"), `import "${ENGINE}";\n`);
  fs.writeFileSync(path.join(root, "src", "resolve.js"), `require.resolve("${ENGINE}");\n`);
  fs.writeFileSync(path.join(root, "src", "bad.d.ts"), `import type { Value } from "${ENGINE}";\n`);
  fs.mkdirSync(path.join(root, "dist"));
  fs.writeFileSync(path.join(root, "dist", "bundle.js"), `require("${ENGINE}");\n`);
  fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { paths: { [ENGINE]: ["./shim"] } },
  }));
  fs.writeFileSync(path.join(root, "vite.config.js"), `export default { resolve: { alias: { "${ENGINE}": "./shim" } } };\n`);
  fs.writeFileSync(path.join(root, "README.md"), `npm install ${ENGINE}\n`);

  const result = inspectRepository(root);
  for (const prefix of [
    "package-lock.json:",
    "src/bad.js:",
    "src/side-effect.js:",
    "src/resolve.js:",
    "src/bad.d.ts:",
    "dist/bundle.js:",
    "tsconfig.json:",
    "vite.config.js:",
    "README.md:",
  ]) {
    assert.ok(result.violations.some((entry) => entry.startsWith(prefix)), prefix);
  }
});

test("finds a prohibited transitive installed dependency, including its declared graph edge", () => {
  const root = fixture();
  const cleanRoot = path.join(root, "node_modules", "clean-package");
  const prohibitedRoot = path.join(cleanRoot, "node_modules", ENGINE);
  fs.mkdirSync(prohibitedRoot, { recursive: true });
  fs.writeFileSync(path.join(cleanRoot, "package.json"), JSON.stringify({
    dependencies: { [ENGINE]: "1.0.0" },
    name: "clean-package",
    version: "1.0.0",
  }));
  fs.writeFileSync(path.join(prohibitedRoot, "package.json"), JSON.stringify({
    name: ENGINE,
    version: "1.0.0",
  }));
  const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  rootManifest.dependencies = { "clean-package": "1.0.0" };
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(rootManifest));

  assert.ok(inspectInstalledGraph(root).length > 0);
});

test("reads peer and optional edges from every installed package manifest", () => {
  const root = fixture();
  const cleanRoot = path.join(root, "node_modules", "clean-package");
  fs.mkdirSync(cleanRoot, { recursive: true });
  fs.writeFileSync(path.join(cleanRoot, "package.json"), JSON.stringify({
    name: "clean-package",
    optionalDependencies: { [`${ENGINE}-stdlib`]: "1.0.0" },
    peerDependencies: { [`@react-${ENGINE}/fiber`]: "1.0.0" },
    version: "1.0.0",
  }));
  assert.ok(inspectInstalledManifests(root).length >= 2);
});

test("rejects prohibited SBOM components and scans the actual npm tarball", () => {
  const root = fixture();
  const sbom = path.join(root, "sbom.json");
  fs.writeFileSync(sbom, JSON.stringify({
    components: [{ name: ENGINE, purl: `pkg:npm/${ENGINE}@1.0.0` }],
  }));
  assert.ok(inspectSbom(sbom).length > 0);
  assert.deepEqual(inspectPackageArtifact(root), []);

  fs.writeFileSync(path.join(root, "src", "bad.js"), `require("${ENGINE}");\n`);
  assert.ok(inspectPackageArtifact(root).some((entry) => entry.startsWith("tarball:")));
});

test("fails package evidence when a declared public entrypoint is absent from the tarball", () => {
  const root = fixture();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  manifest.main = "./dist/index.js";
  manifest.exports = { ".": { import: "./dist/index.js" } };
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));
  assert.ok(
    inspectPackageArtifact(root).some((entry) => entry.includes("missing-public-entrypoint")),
  );
});

test("allows historical ADR text and active prohibition statements", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "docs", "adrs", "adr-0001-history.md"), `npm install ${ENGINE}\n`);
  fs.writeFileSync(path.join(root, "README.md"), `${ENGINE} is permanently prohibited and must never be installed.\n`);
  assert.deepEqual(inspectRepository(root).violations, []);
});

test("rejects active documentation that instructs consumers to use TSL or R3F", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "README.md"), "Use TSL shaders and adopt R3F for the renderer.\n");
  assert.ok(inspectRepository(root).violations.some((entry) => entry.startsWith("README.md:")));
});

test("fails closed instead of skipping symbolic-link evidence", () => {
  const root = fixture();
  fs.symlinkSync(path.join(root, "src", "index.js"), path.join(root, "src", "linked.js"));
  assert.throws(() => inspectRepository(root), /symbolic link/u);
});

test("fails closed on incomplete or tampered evidence and accepts complete package identity", () => {
  const root = fixture();
  const file = path.join(root, "evidence.json");
  fs.writeFileSync(file, JSON.stringify({
    checks: {},
    digest: "a".repeat(64),
    package: { name: "fixture", version: "1.0.0" },
    schemaVersion: 1,
    status: "pass",
  }));
  assert.throws(() => verifyEvidence(file), /skipped source/u);

  const unsigned = {
    schemaVersion: 1,
    status: "pass",
    root: "fixture",
    package: { name: "fixture", version: "1.0.0" },
    checks: Object.fromEntries([
      "source",
      "manifests",
      "locks",
      "installed",
      "declarations",
      "bundles",
      "tarball",
      "sbom",
      "active-docs",
    ].map((name) => [name, true])),
  };
  fs.writeFileSync(file, JSON.stringify({ ...unsigned, digest: digestEvidence(unsigned) }));
  assert.equal(verifyEvidence(file).package.name, "fixture");
  fs.writeFileSync(file, JSON.stringify({
    ...unsigned,
    package: { name: "tampered", version: "1.0.0" },
    digest: digestEvidence(unsigned),
  }));
  assert.throws(() => verifyEvidence(file), /digest does not match/u);
});

test("package CI and production CD cannot skip permanent Zero-Three evidence", () => {
  const root = path.resolve(__dirname, "..");
  const packageData = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  const cd = fs.readFileSync(path.join(root, ".github", "workflows", "cd.yml"), "utf8");
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

  assert.match(packageData.scripts["zero-three"], /--package\b.*--evidence-out\b/u);
  assert.match(packageData.scripts["zero-three:source"], /--source-only\b/u);
  assert.match(packageData.scripts["zero-three:test"], /node --test/u);
  assert.match(packageData.scripts.prepublishOnly, /npm run zero-three/u);
  assert.match(ci, /npm run zero-three:source/u);
  assert.match(ci, /npm run zero-three:test/u);
  assert.match(ci, /npm run zero-three[\s\S]*actions\/upload-artifact@/u);
  assert.match(cd, /npm run zero-three/u);
  assert.match(cd, /zero-three-evidence\.json/u);
  assert.match(cd, /actions\/upload-artifact@[\s\S]*actions\/download-artifact@/u);
  assert.match(cd, /gh release upload[\s\S]*Zero-Three evidence[\s\S]*subject-path:/u);
  assert.match(ignore, /^release-artifacts\/$/mu);
  assert.ok(ci.indexOf("npm run zero-three:source") < ci.indexOf("npm ci"));
  assert.ok(cd.indexOf("npm run zero-three:source") < cd.indexOf("npm ci"));
});
