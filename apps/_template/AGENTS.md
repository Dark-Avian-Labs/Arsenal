# dal-template

`apps/_template` (`dal-template`) is the starter. It is not deployed. Shared rules for ports, auth, env, the shell, and validate are in the repo `AGENTS.md`. If this file and a live app disagree on the shell, follow `packages/ui`.

Port 3000. Signed-out Playwright is 3100. Signed-in Playwright is 4100.

Vitest here is Node-only. Do not add happy-dom or `*.test.tsx` until there is a real component test. HTTP tests go through `createApp()`. In development the API does not serve the SPA. Test and production serve `dist/client` when `index.html` exists, and return 503 when it does not. Signed-out Playwright runs after `pnpm run build`. Signed-in Playwright builds the client into `dist/e2e-client`. `pnpm run build` still writes `dist/client`.
