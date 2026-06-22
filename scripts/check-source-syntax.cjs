const { execFileSync } = require("node:child_process");
const { readdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const sourceDir = join(root, "src");
const sourceFiles = readdirSync(sourceDir)
  .filter((fileName) => fileName.endsWith(".js"))
  .sort()
  .map((fileName) => join(sourceDir, fileName));

for (const sourceFile of sourceFiles) {
  execFileSync(process.execPath, ["--check", sourceFile], {
    stdio: "inherit",
  });
}
