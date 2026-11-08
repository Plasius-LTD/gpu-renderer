# Native raster completion: local validation

Work: gpu-renderer#305, site Feature #2384 / Story #2416. Recorded 8 November 2026.

- Node 24.18.0; existing locked dependencies installed with `npm ci`.
- Eight initial async-contract tests failed first because `renderAsync` was absent.
  Three subsequent partial-failure tests failed first on driver-error exposure,
  skipped cleanup and loss of the controlled async rejection. All pass after fixes.
- `npm run build`, followed by `npm run test:coverage`: 528 tests pass, none skipped.
  The first coverage attempt lacked the built public entrypoint; build then rerun
  passed. No test or gate was removed.
- LCOV: 17,858 / 18,589 lines (96.06% truncated); changed runtime file
  `src/native-scene-renderer.js` has 793 / 793 lines, 196 / 204 branches and
  27 / 32 functions covered. Package branches 79.87%, functions 90.95%; the required
  80% line gate and changed-source LCOV presence pass. Declarations are checked
  by the public TypeScript consumer.
- Source syntax, TypeScript and clean packed-package type-consumer checks pass.
  ESLint passes with zero warnings. An overlapping test's temporary README
  example removal interrupted the first lint run; lint was repeated after tests.
- Public-package check and Zero-Three source/manifest/lock/declaration/bundle/
  documentation/installed/tarball/SBOM checks pass. No new dependency is added.
- Full dependency audit: zero known vulnerabilities. Reviewed available updates:
  gpu-model-core, gpu-shader, gpu-shared, c8, ESLint, globals and tsup have newer
  releases. This isolated native lifecycle API needs none of their new APIs;
  existing reviewed lock remains unchanged, avoiding unrelated engine/toolchain
  migrations. The consuming gpu-shared task will use a released renderer version.

Fixtures verify WebGPU lifecycle behavior and cleanup, not hardware frame pacing
or game qualification. No gameplay, ten-hour content, touch accessibility or
physical-device performance claim follows from these tests. Stored arcade flags
remain disabled. Remote CI, protected merge and exact-main production OIDC
publication must be verified on the linked task before it is marked Done.
