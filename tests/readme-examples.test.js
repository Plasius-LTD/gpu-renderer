import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

test("README JavaScript examples typecheck against the public package declarations", () => {
  const readme = ["README.md", "docs/guides/wavefront.md", "docs/guides/integration.md"]
    .map(file => readFileSync(path.join(root, file), "utf8")).join("\n");
  const examples = [...readme.matchAll(/```js\n([\s\S]*?)\n```/g)];
  assert.ok(examples.length > 0, "The package needs an executable usage example");
  const directory = mkdtempSync(path.join(root, ".readme-examples-"));
  try {
    const files = examples.map((match, index) => {
      const file = path.join(directory, `example-${index + 1}.mjs`);
      writeFileSync(file, `${match[1]}\nexport {};\n`);
      return file;
    });
    const result = spawnSync(process.execPath, [
      path.join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit", "--allowJs", "--checkJs", "--skipLibCheck",
      "--target", "ES2022", "--module", "NodeNext",
      "--moduleResolution", "NodeNext", ...files,
    ], { cwd: root, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.error?.message ?? `${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
