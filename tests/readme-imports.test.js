import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

test("Consumer examples import supported public renderer exports", async () => {
  const files = [new URL("../README.md", import.meta.url),
    ...readdirSync(new URL("../docs/guides/", import.meta.url))
      .filter(file => file.endsWith(".md"))
      .map(file => new URL(`../docs/guides/${file}`, import.meta.url))];
  const readme = files.map(file => readFileSync(file, "utf8")).join("\n");
  const examples = [...readme.matchAll(/```js\n([\s\S]*?)\n```/g)];
  let checked = 0;
  for (const [, example] of examples) {
    for (const [, bindings, specifier] of example.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
      if (specifier !== "@plasius/gpu-renderer" && specifier !== "@plasius/gpu-shared/material-study") continue;
      const publicModule = await import(specifier);
      for (const binding of bindings.split(",")) {
        const name = binding.trim().split(/\s+as\s+/)[0];
        if (!name) continue;
        assert.ok(Object.hasOwn(publicModule, name), `${specifier} does not export ${name}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 0, "No public renderer example was checked");
});
