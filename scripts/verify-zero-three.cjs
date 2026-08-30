#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ENGINE = ["th", "ree"].join("");
const REACT_ENGINE = ["@react", ENGINE].join("-");
const EXACT = new Set([
  ENGINE,
  ["@types", ENGINE].join("/"),
  [ENGINE, "mesh", "bvh"].join("-"),
  [ENGINE, "gpu", "pathtracer"].join("-"),
  [ENGINE, "stdlib"].join("-"),
]);
const PREFIXES = [`${ENGINE}/`, `${REACT_ENGINE}/`];
const LOCK_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".d.ts",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
  ".txt",
  ".wgsl",
  ".yaml",
  ".yml",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".npm-cache",
  ".npm-cache-packcheck",
  "coverage",
  "node_modules",
  "release-artifacts",
  "tsp-output",
]);
const REQUIRED_EVIDENCE_CHECKS = Object.freeze([
  "source",
  "manifests",
  "locks",
  "installed",
  "declarations",
  "bundles",
  "tarball",
  "sbom",
  "active-docs",
]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replaceAll("%40", "@")
    .replaceAll("%2f", "/")
    .replaceAll("%2F", "/")
    .toLowerCase();
}

function packageCandidates(value) {
  const normalized = normalize(value);
  const candidates = new Set([normalized]);
  for (const marker of ["node_modules/", "pkg:npm/", "npm:"]) {
    let cursor = normalized.indexOf(marker);
    while (cursor >= 0) {
      candidates.add(normalized.slice(cursor + marker.length));
      cursor = normalized.indexOf(marker, cursor + marker.length);
    }
  }
  return [...candidates].flatMap((candidate) => (
    candidate.split(/[\s'"`(){}[\],=|]+/u).filter(Boolean)
  ));
}

function stripVersion(value) {
  if (value.startsWith("@")) {
    const slash = value.indexOf("/");
    const version = slash < 0 ? -1 : value.indexOf("@", slash);
    return version < 0 ? value : value.slice(0, version);
  }
  const version = value.indexOf("@");
  return version < 0 ? value : value.slice(0, version);
}

function isForbiddenPackageName(value) {
  return packageCandidates(value).some((candidate) => {
    const name = stripVersion(candidate.replace(/^package\//u, ""));
    return EXACT.has(name) || PREFIXES.some((prefix) => name.startsWith(prefix));
  });
}

function walk(root, callback, relative = "") {
  const directory = path.join(root, relative);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`symbolic link evidence is not permitted: ${child.replaceAll(path.sep, "/")}`);
    }
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) walk(root, callback, child);
      continue;
    }
    if (entry.isFile()) callback(path.join(root, child), child.replaceAll(path.sep, "/"));
  }
}

function withRegularFile(file, label, callback) {
  if (!Number.isInteger(fs.constants.O_NOFOLLOW)) {
    throw new Error("atomic non-symlink file validation is unavailable on this platform");
  }
  let descriptor;
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (!fs.fstatSync(descriptor).isFile()) {
      throw new Error(`${label} is not a regular file: ${file}`);
    }
    return callback(descriptor);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${file}`, { cause: error });
    if (error?.code === "ELOOP") {
      throw new Error(`${label} is a symbolic link: ${file}`, { cause: error });
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function readRegularText(file, label) {
  return withRegularFile(file, label, (descriptor) => fs.readFileSync(descriptor, "utf8"));
}

function inspectJson(value, location, violations, trail = "$") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectJson(item, location, violations, `${trail}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (isForbiddenPackageName(key)) violations.push(`${location}:${trail}.${key}`);
      inspectJson(item, location, violations, `${trail}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && isForbiddenPackageName(value)) {
    violations.push(`${location}:${trail}`);
  }
}

function isHistoricalAdr(relative) {
  return /(?:^|\/)docs\/adrs\/[^/]+\.md$/iu.test(relative);
}

function isInstruction(line) {
  const lowered = normalize(line);
  const usage = /(?:\bimport\b|\brequire\s*\(|\bfrom\s+['"]|\bnpm\s+(?:i|install)\b|\bpnpm\s+add\b|\byarn\s+add\b|\btypes\b|\bpaths\b|\balias\b|\b(?:use|adopt|install|integrate)\s+(?:tsl|r3f)\b)/u.test(lowered);
  const prohibition = /(?:prohibit|forbid|must not|never|do not|remove|retir|deprecated|zero[- ]engine)/u.test(
    lowered.replaceAll(ENGINE, "engine"),
  );
  return usage && !prohibition;
}

function hasDocumentSpecifier(paragraph) {
  for (const match of paragraph.matchAll(/[`"']([^`"']+)[`"']/gu)) {
    if (isForbiddenPackageName(match[1])) return true;
  }
  for (const match of paragraph.matchAll(/\b(?:npm\s+(?:i|install)|pnpm\s+add|yarn\s+add)\s+([^\s]+)/giu)) {
    if (isForbiddenPackageName(match[1])) return true;
  }
  return /\b(?:use|adopt|install|integrate)\s+(?:tsl|r3f)\b/u.test(normalize(paragraph));
}

function inspectText(contents, relative, violations) {
  const extension = relative.endsWith(".d.ts")
    ? ".d.ts"
    : path.extname(relative).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) return;
  const document = extension === ".md";
  const jsonConfig = extension === ".json"
    && /(?:^|\/)(?:tsconfig|vite|vitest|jest|babel|eslint|rollup|webpack)[^/]*\.json$/iu.test(relative);
  const sourceConfig = /(?:^|\/)(?:vite|vitest|jest|babel|eslint|rollup|webpack)\.config\.(?:cjs|js|mjs|ts)$/iu.test(relative);
  if (document && isHistoricalAdr(relative)) return;

  if (document) {
    let lineOffset = 0;
    for (const paragraph of contents.split(/\r?\n\s*\r?\n/u)) {
      if (hasDocumentSpecifier(paragraph) && isInstruction(paragraph)) {
        violations.push(`${relative}:${lineOffset + 1}`);
      }
      lineOffset += paragraph.split(/\r?\n/u).length + 1;
    }
    return;
  }

  if (jsonConfig || sourceConfig) {
    contents.split(/\r?\n/u).forEach((line, index) => {
      for (const match of line.matchAll(/["']([^"']+)["']/gu)) {
        if (isForbiddenPackageName(match[1])) violations.push(`${relative}:${index + 1}`);
      }
    });
    return;
  }

  const specifierPattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire(?:\.resolve)?\s*\(|\breference\s+types\s*=\s*|\bmodule\s*:\s*|\balias\s*:\s*)["']([^"']+)["']/giu;
  contents.split(/\r?\n/u).forEach((line, index) => {
    for (const match of line.matchAll(specifierPattern)) {
      if (isForbiddenPackageName(match[1])) violations.push(`${relative}:${index + 1}`);
    }
  });
}

function inspectRepository(root) {
  const violations = [];
  const checks = new Set([
    "source",
    "manifests",
    "locks",
    "declarations",
    "bundles",
    "active-docs",
  ]);
  walk(root, (absolute, relative) => {
    const basename = path.basename(relative);
    if (basename === "package.json" || LOCK_NAMES.has(basename)) {
      if (basename.endsWith(".json")) {
        try {
          inspectJson(JSON.parse(readRegularText(absolute, relative)), relative, violations);
        } catch (error) {
          violations.push(`${relative}:invalid-json:${error.message}`);
        }
      } else {
        readRegularText(absolute, relative).split(/\r?\n/u).forEach((line, index) => {
          if (isForbiddenPackageName(line)) violations.push(`${relative}:${index + 1}`);
        });
      }
      return;
    }
    inspectText(readRegularText(absolute, relative), relative, violations);
  });
  return { checks: [...checks], violations: [...new Set(violations)].sort() };
}

function inspectInstalledGraph(root) {
  const result = spawnSync("npm", ["ls", "--all", "--json", "--long"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!result.stdout.trim()) {
    throw new Error("npm did not produce installed dependency evidence");
  }
  let graph;
  try {
    graph = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error("installed dependency evidence is invalid JSON", { cause: error });
  }
  const violations = [];
  inspectJson(graph, "installed-graph", violations);
  violations.push(...inspectInstalledManifests(root));
  return violations;
}

function inspectInstalledManifests(root) {
  const nodeModules = path.join(root, "node_modules");
  const violations = [];

  const inspectPackageDirectory = (directory, relative) => {
    const manifestPath = path.join(directory, "package.json");
    inspectJson(
      JSON.parse(readRegularText(manifestPath, `installed package manifest for ${relative}`)),
      `installed-manifest:${relative}/package.json`,
      violations,
    );
    const nested = path.join(directory, "node_modules");
    inspectNodeModules(nested, `${relative}/node_modules`);
  };

  const inspectNodeModules = (directory, relative, required = false) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (!required && error?.code === "ENOENT") return;
      if (required && error?.code === "ENOENT") {
        throw new Error("installed dependency evidence is missing (node_modules not found)", {
          cause: error,
        });
      }
      throw error;
    }
    for (const entry of entries) {
      if (entry.name === ".bin" || entry.name.startsWith(".")) continue;
      const absolute = path.join(directory, entry.name);
      const child = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(`installed dependency evidence contains a symbolic link: ${child}`);
      }
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("@")) {
        for (const scopedEntry of fs.readdirSync(absolute, { withFileTypes: true })) {
          const scopedAbsolute = path.join(absolute, scopedEntry.name);
          const scopedChild = `${child}/${scopedEntry.name}`;
          if (scopedEntry.isSymbolicLink()) {
            throw new Error(`installed dependency evidence contains a symbolic link: ${scopedChild}`);
          }
          if (scopedEntry.isDirectory()) inspectPackageDirectory(scopedAbsolute, scopedChild);
        }
      } else {
        inspectPackageDirectory(absolute, child);
      }
    }
  };

  inspectNodeModules(nodeModules, "node_modules", true);
  return violations;
}

function inspectSbom(file) {
  const violations = [];
  inspectJson(JSON.parse(readRegularText(file, "SBOM evidence")), path.basename(file), violations);
  return violations;
}

function runJsonCommand(command, args, root, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    const detail = (result.stderr || "no output").trim().split(/\r?\n/u)[0];
    throw new Error(`${label} evidence could not be generated: ${detail}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`${label} evidence is invalid JSON`, { cause: error });
  }
}

function runNpmJson(args, root, label) {
  return process.env.npm_execpath
    ? runJsonCommand(process.execPath, [process.env.npm_execpath, ...args], root, label)
    : runJsonCommand("npm", args, root, label);
}

function inspectPublicEntrypoints(packageRoot) {
  const manifestPath = path.join(packageRoot, "package.json");
  const manifest = JSON.parse(readRegularText(manifestPath, "tarball package manifest"));
  const targets = new Set();
  const collect = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("./") && !value.includes("*")) targets.add(value.slice(2));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(manifest.main);
  collect(manifest.module);
  collect(manifest.types);
  collect(manifest.exports);

  const violations = [];
  for (const target of targets) {
    const normalized = path.posix.normalize(target.replaceAll("\\", "/"));
    if (normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) {
      violations.push(`unsafe-public-entrypoint:${target}`);
      continue;
    }
    const absolute = path.join(packageRoot, ...normalized.split("/"));
    try {
      withRegularFile(absolute, `public entrypoint ${normalized}`, () => true);
    } catch {
      violations.push(`missing-public-entrypoint:${normalized}`);
    }
  }
  return violations;
}

function inspectPackageArtifact(root) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "zero-engine-pack-"));
  try {
    const packed = runNpmJson([
      "pack",
      "--ignore-scripts",
      "--json",
      "--cache",
      path.join(temporary, "npm-cache"),
      "--pack-destination",
      temporary,
    ], root, "npm tarball");
    const filename = Array.isArray(packed) && packed.length === 1
      ? packed[0]?.filename
      : undefined;
    if (!filename || path.basename(filename) !== filename) {
      throw new Error("npm tarball evidence returned an unsafe filename");
    }
    const tarball = path.join(temporary, filename);
    const extracted = path.join(temporary, "extracted");
    fs.mkdirSync(extracted);
    const unpack = spawnSync("tar", ["-xzf", tarball, "-C", extracted], {
      encoding: "utf8",
    });
    if (unpack.status !== 0) {
      throw new Error(`npm tarball evidence could not be extracted: ${unpack.stderr.trim()}`);
    }
    const packageRoot = path.join(extracted, "package");
    return [
      ...inspectRepository(packageRoot).violations,
      ...inspectPublicEntrypoints(packageRoot),
    ].map((item) => `tarball:${item}`);
  } finally {
    fs.rmSync(temporary, { force: true, recursive: true });
  }
}

function inspectGeneratedSbom(root) {
  const document = runNpmJson([
    "sbom",
    "--sbom-format=cyclonedx",
    "--sbom-type=library",
    "--omit=dev",
  ], root, "npm SBOM");
  const violations = [];
  inspectJson(document, "generated-sbom", violations);
  return violations;
}

function digestEvidence(evidence) {
  return crypto.createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

function readPackageIdentity(root) {
  const manifestPath = path.join(root, "package.json");
  const manifest = JSON.parse(readRegularText(manifestPath, "package identity manifest"));
  if (
    typeof manifest.name !== "string"
    || manifest.name.trim() === ""
    || typeof manifest.version !== "string"
    || manifest.version.trim() === ""
  ) {
    throw new Error("package identity requires non-empty name and version");
  }
  return { name: manifest.name, version: manifest.version };
}

function verifyEvidence(file) {
  const evidence = JSON.parse(readRegularText(file, "package evidence"));
  if (evidence.schemaVersion !== 1 || evidence.status !== "pass") {
    throw new Error(`package evidence is not a passing v1 document: ${file}`);
  }
  if (
    typeof evidence.package?.name !== "string"
    || typeof evidence.package?.version !== "string"
    || evidence.package.name.length === 0
    || evidence.package.version.length === 0
  ) {
    throw new Error(`package evidence identity is missing: ${file}`);
  }
  for (const check of REQUIRED_EVIDENCE_CHECKS) {
    if (evidence.checks?.[check] !== true) {
      throw new Error(`package evidence skipped ${check}: ${file}`);
    }
  }
  if (!/^[a-f0-9]{64}$/u.test(evidence.digest ?? "")) {
    throw new Error(`package evidence digest is missing or invalid: ${file}`);
  }
  const { digest, ...unsigned } = evidence;
  if (digestEvidence(unsigned) !== digest) {
    throw new Error(`package evidence digest does not match its content: ${file}`);
  }
  return evidence;
}

function parseArgs(argv) {
  const result = {
    evidence: [],
    evidenceOut: undefined,
    packageArtifact: false,
    sboms: [],
    sourceOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source-only") result.sourceOnly = true;
    else if (argument === "--package") result.packageArtifact = true;
    else if (["--sbom", "--require-evidence", "--evidence-out"].includes(argument)) {
      const value = argv[++index];
      if (!value) throw new Error(`${argument} requires a value`);
      if (argument === "--sbom") result.sboms.push(value);
      else if (argument === "--require-evidence") result.evidence.push(value);
      else result.evidenceOut = value;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function runCli(argv = process.argv.slice(2), root = process.cwd()) {
  const options = parseArgs(argv);
  const repository = inspectRepository(root);
  const violations = [...repository.violations];
  const completed = Object.fromEntries(repository.checks.map((check) => [check, true]));
  if (!options.sourceOnly) {
    violations.push(...inspectInstalledGraph(root));
    completed.installed = true;
    if (options.packageArtifact) {
      violations.push(...inspectPackageArtifact(root));
      violations.push(...inspectGeneratedSbom(root));
      completed.tarball = true;
    } else {
      if (options.sboms.length === 0) {
        throw new Error("SBOM evidence is required for a full Zero-Three check");
      }
      for (const file of options.sboms) {
        violations.push(...inspectSbom(path.resolve(root, file)));
      }
    }
    completed.sbom = true;
  }
  for (const file of options.evidence) verifyEvidence(path.resolve(root, file));
  if (options.evidence.length > 0) completed.packageEvidence = true;
  if (violations.length > 0) {
    throw new Error(
      `forbidden renderer dependency evidence found:\n- ${[...new Set(violations)].sort().join("\n- ")}`,
    );
  }

  const unsigned = {
    schemaVersion: 1,
    status: "pass",
    root: path.basename(root),
    package: readPackageIdentity(root),
    checks: completed,
  };
  const evidence = { ...unsigned, digest: digestEvidence(unsigned) };
  if (options.evidenceOut) {
    const evidencePath = path.resolve(root, options.evidenceOut);
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
  return evidence;
}

module.exports = {
  ENGINE,
  digestEvidence,
  inspectGeneratedSbom,
  inspectInstalledGraph,
  inspectInstalledManifests,
  inspectJson,
  inspectPackageArtifact,
  inspectRepository,
  inspectSbom,
  isForbiddenPackageName,
  parseArgs,
  readPackageIdentity,
  runCli,
  verifyEvidence,
};

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`Zero-Three validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
