import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ciWorkflow = read(".github/workflows/ci.yml");
const cdWorkflow = read(".github/workflows/cd.yml");
const releasePrepareWorkflow = read(".github/workflows/release-prepare.yml");
const npmConfig = read(".npmrc");

test("pull-request validation admits only same-repository heads", () => {
  assert.match(ciWorkflow, /pull_request:\s*\n\s+branches: \[main\]/u);
  assert.doesNotMatch(ciWorkflow, /pull_request_target:/u);
  assert.match(ciWorkflow, /name: Trusted head admission/u);
  assert.match(
    ciWorkflow,
    /External fork pull requests cannot be merged/u,
  );
  assert.equal((ciWorkflow.match(/needs: trusted_head/gu) ?? []).length, 2);
  assert.equal(
    (
      ciWorkflow.match(
        /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/gu,
      ) ?? []
    ).length,
    2,
  );
  assert.equal(
    (
      ciWorkflow.match(
        /runs-on: \$\{\{ fromJSON\(github\.event_name == 'pull_request' && '\["ubuntu-latest"\]' \|\| '\["self-hosted","Linux","X64"\]'\) \}\}/gu,
      ) ?? []
    ).length,
    2,
  );
});

test("publication binds a second run to exact main and successful CI", () => {
  assert.match(cdWorkflow, /- prepare/u);
  assert.match(cdWorkflow, /- publish/u);
  assert.match(cdWorkflow, /expected_commit_sha/u);
  assert.match(cdWorkflow, /"ref": "main"/u);
  assert.match(cdWorkflow, /"phase": "publish"/u);
  assert.match(cdWorkflow, /actions\/workflows\/cd\.yml\/dispatches/u);
  assert.match(cdWorkflow, /-f head_sha="\$\{EXPECTED_SHA\}"/u);
  assert.match(cdWorkflow, /-f branch=main/u);
  assert.match(cdWorkflow, /-f event=push/u);
  assert.match(cdWorkflow, /refs\/heads\/main/u);
  assert.match(
    releasePrepareWorkflow,
    /COMMIT_SHA=\$\(git rev-parse HEAD\)/u,
  );
});

test("release concurrency is supported and phase-isolated", () => {
  assert.match(
    cdWorkflow,
    /group: npm-cd-\$\{\{ github\.repository \}\}-\$\{\{ inputs\.phase == 'publish'/u,
  );
  assert.match(cdWorkflow, /inputs\.expected_commit_sha/u);
  assert.match(cdWorkflow, /cancel-in-progress: false/u);
  assert.doesNotMatch(cdWorkflow, /queue:/u);
});

test("publication uses hosted npm OIDC without a write-token fallback", () => {
  assert.match(cdWorkflow, /runs-on: ubuntu-latest/u);
  assert.match(cdWorkflow, /environment: production/u);
  assert.match(cdWorkflow, /id-token: write/u);
  assert.match(cdWorkflow, /--provenance/u);
  assert.match(cdWorkflow, /npm publish/u);
  assert.doesNotMatch(cdWorkflow, /NPM_TOKEN/u);
  assert.doesNotMatch(cdWorkflow, /NODE_AUTH_TOKEN/u);
  assert.doesNotMatch(npmConfig, /_authToken/u);
  assert.doesNotMatch(npmConfig, /NODE_AUTH_TOKEN/u);
});

test("dependency code cannot run inside the OIDC mutation job", () => {
  const validationJob = cdWorkflow.slice(
    cdWorkflow.indexOf("\n  validate_and_pack:"),
    cdWorkflow.indexOf("\n  publish:"),
  );
  const publishJob = cdWorkflow.slice(cdWorkflow.indexOf("\n  publish:"));

  assert.match(
    validationJob,
    /npm ci --no-fund --no-audit --legacy-peer-deps/u,
  );
  assert.match(validationJob, /npm pack --ignore-scripts --json/u);
  assert.match(validationJob, /actions\/upload-artifact@v7/u);
  assert.doesNotMatch(validationJob, /environment: production/u);
  assert.doesNotMatch(validationJob, /id-token: write/u);
  assert.match(publishJob, /actions\/download-artifact@v8/u);
  assert.match(publishJob, /digest-mismatch: error/u);
  assert.doesNotMatch(publishJob, /npm ci/u);
  assert.doesNotMatch(publishJob, /npm run /u);
});

test("release metadata lands through a unique non-force-pushed PR", () => {
  assert.match(
    releasePrepareWorkflow,
    /name: Checkout main[\s\S]*?persist-credentials: false/u,
  );
  assert.match(
    releasePrepareWorkflow,
    /git remote set-url origin "https:\/\/x-access-token:\$\{AUTH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git"/u,
  );
  assert.match(
    releasePrepareWorkflow,
    /BRANCH="release\/\$\{TAG\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}"/u,
  );
  assert.doesNotMatch(
    releasePrepareWorkflow,
    /git push origin "HEAD:\$\{BASE_BRANCH\}"/u,
  );
  assert.doesNotMatch(releasePrepareWorkflow, /--force-with-lease/u);
  assert.doesNotMatch(releasePrepareWorkflow, /secrets: inherit/u);
});
