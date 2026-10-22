# OpenSKP

Source: https://github.com/iamahsanmehmood/openskp

Revision: `23a15e8742e936694bf14aa029cb0e2862dce5b9` (2026-10-22).

`index.mjs` is an unmodified ESM bundle of `packages/typescript/src/index.ts`, made with esbuild (`--bundle --format=esm --platform=node --packages=external`). License: MIT, included alongside the bundle. It is pinned because the npm 1.3.0 legacy parser fails on the supplied `T2_Ap+.skp`; this revision reads it successfully. No SketchUp SDK or service is used. The Node-only `SkpFile.open()` API is not used; parsing always takes an ArrayBuffer.
