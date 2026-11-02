import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/cd.yml", import.meta.url), "utf8");
const discoveries = [...workflow.matchAll(/RUNS="\$\([\s\S]*?MATCHES="\$\([\s\S]*?<<<"\$\{RUNS\}"\s*\)"/gu)].map(match => match[0]);
const sha = "a".repeat(40);
const passed = { head_sha: sha, head_branch: "main", event: "push", status: "completed", conclusion: "success" };
const jq = spawnSync("jq", ["--version"], { encoding: "utf8" });
assert.equal(jq.status, 0, "jq is required: missing tools must not masquerade as rejected CI evidence");

function discover(script, response) {
  // Exercise the workflow's actual shell query and jq predicate. Only gh is
  // replaced: reproduce an empty status-index result without using credentials.
  const fakeGh = `gh() {
    case "$*" in *status=*) printf '%s' '{"workflow_runs":[]}';; *) printf '%s' "$DISCOVERY_FIXTURE";; esac
  }`;
  return spawnSync("bash", ["-c", `set -euo pipefail\n${fakeGh}\n${script}\ntest "$MATCHES" -gt 0`], {
    encoding: "utf8",
    timeout: 5000,
    env: { PATH: process.env.PATH, EXPECTED_SHA: sha, GITHUB_REPOSITORY: "example/renderer", DISCOVERY_FIXTURE: typeof response === "string" ? response : JSON.stringify(response) },
  });
}

test("all four release boundaries discover exact successful CI despite an empty remote status index", () => {
  assert.equal(discoveries.length, 4);
  for (const script of discoveries) {
    assert.match(script, /actions\/workflows\/ci\.yml\/runs/u);
    for (const field of ['branch=main', 'event=push', 'head_sha="${EXPECTED_SHA}"', 'per_page=100']) assert.ok(script.includes(field));
    const result = discover(script, { workflow_runs: [passed] });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("every release boundary rejects missing, malformed or unsuccessful exact-commit evidence", () => {
  const rejected = [
    { workflow_runs: [] }, {}, { workflow_runs: null }, "invalid JSON",
    ...Object.entries({ head_sha: "b".repeat(40), head_branch: "review", event: "pull_request", status: "in_progress", conclusion: "failure" })
      .map(([key, value]) => ({ workflow_runs: [{ ...passed, [key]: value }] })),
    { workflow_runs: [{ ...passed, status: "queued", conclusion: null }] },
    { workflow_runs: [{ ...passed, conclusion: "cancelled" }] },
  ];
  assert.equal(discoveries.length, 4);
  for (const script of discoveries) for (const response of rejected) {
    const result = discover(script, response);
    assert.notEqual(result.status, 0, "invalid evidence authorized publication");
  }
});
