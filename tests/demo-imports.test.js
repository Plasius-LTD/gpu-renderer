import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Linter } from "eslint";

const root = new URL("../", import.meta.url);
const page = new URL("demo/index.html", root);
const entry = new URL("./main.js", page);
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

function staticImports(url) {
  const imports = [];
  const capture = ({ source }) => {
    if (source) imports.push(source.value);
  };
  const diagnostics = new Linter().verify(readFileSync(url, "utf8"), {
    languageOptions: { ecmaVersion: "latest", sourceType: "module" },
    plugins: {
      demo: {
        rules: {
          imports: {
            create: () => ({
              ImportDeclaration: capture,
              ExportNamedDeclaration: capture,
              ExportAllDeclaration: capture,
            }),
          },
        },
      },
    },
    rules: { "demo/imports": "error" },
  });
  assert.deepEqual(diagnostics, [], `could not parse ${url.pathname}`);
  return imports;
}

test("demo entry uses the renderer and only declared package dependencies", () => {
  const permitted = new Set([manifest.name, ...Object.keys(manifest.dependencies)]);
  const imports = staticImports(entry);
  assert.ok(imports.includes(manifest.name), "use the renderer's public entry");
  assert.ok(imports.includes("@plasius/gpu-shared"), "use the shared showcase's public entry");
  for (const specifier of imports) {
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      assert.ok(new URL(specifier, entry).href.startsWith(new URL("demo/", root).href),
        `relative imports must be owned by the demo: ${specifier}`);
    } else {
      assert.ok(permitted.has(specifier), `undeclared or deep package import: ${specifier}`);
    }
  }
});

test("the built demo's static module graph resolves through public exports", () => {
  const html = readFileSync(page, "utf8");
  const map = html.match(/<script type="importmap">([\s\S]+?)<\/script>/u);
  assert.ok(map, "the browser needs an import map");
  const { imports } = JSON.parse(map[1]);
  const visited = new Set();
  const pending = [entry];
  for (const [specifier, target] of Object.entries(imports)) {
    assert.equal(new URL(target, page).href, import.meta.resolve(specifier),
      `map ${specifier} to the installed public ESM export`);
  }
  while (pending.length > 0) {
    const url = pending.pop();
    if (visited.has(url.href)) continue;
    visited.add(url.href);
    for (const specifier of staticImports(url)) {
      const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
      assert.ok(isRelative || Object.hasOwn(imports, specifier),
        `unmapped browser import ${specifier} from ${url.pathname}`);
      const resolved = isRelative ? new URL(specifier, url) : new URL(imports[specifier], page);
      assert.ok(resolved.href.startsWith(root.href), `import escaped the checkout: ${specifier}`);
      pending.push(resolved);
    }
  }
});
