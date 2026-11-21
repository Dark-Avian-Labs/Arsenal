import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function httpGet(port, reqPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqPath,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function seedMinimalCatalogs(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });

  const wf = new DatabaseSync(path.join(dataDir, 'warframe-catalog.db'));
  try {
    wf.exec(`
      CREATE TABLE warframes (unique_name TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE weapons (unique_name TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE mods (unique_name TEXT PRIMARY KEY, name TEXT);
    `);
  } finally {
    wf.close();
  }

  const wor = new DatabaseSync(path.join(dataDir, 'wor-catalog.db'));
  try {
    wor.exec(`
      CREATE TABLE catalog_meta (id INTEGER PRIMARY KEY, catalog_version INTEGER NOT NULL DEFAULT 1);
      INSERT INTO catalog_meta (id, catalog_version) VALUES (1, 1);
      CREATE TABLE catalog_heroes (slug TEXT PRIMARY KEY, name TEXT NOT NULL, faction TEXT, class TEXT, rarity TEXT);
      CREATE TABLE catalog_artifacts (slug TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE catalog_demons (slug TEXT PRIMARY KEY, name TEXT NOT NULL);
    `);
  } finally {
    wor.close();
  }
}

async function waitForReady(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not started';
  while (Date.now() < deadline) {
    try {
      const res = await httpGet(port, '/readyz');
      if (res.status === 200) return JSON.parse(res.body);
      lastError = `HTTP ${res.status}: ${res.body}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `Deployed Arsenal host did not become ready within ${timeoutMs}ms (${lastError})`,
  );
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenal-deploy-smoke-'));
  const deployDir = path.join(tmpRoot, 'deploy');
  const dataDir = path.join(tmpRoot, 'data');
  let child = null;
  const output = [];

  try {
    seedMinimalCatalogs(dataDir);

    console.log(`[smoke] Deploying production bundle to ${deployDir}...`);
    const [cmd, args] =
      process.platform === 'win32'
        ? [
            'cmd.exe',
            ['/d', '/s', '/c', 'pnpm', '--filter', 'arsenal', 'deploy', '--prod', deployDir],
          ]
        : ['pnpm', ['--filter', 'arsenal', 'deploy', '--prod', deployDir]];
    execFileSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' });

    const port = await findFreePort();
    console.log(`[smoke] Booting deployed Arsenal host on 127.0.0.1:${port}...`);
    child = spawn(process.execPath, [path.join(deployDir, 'server', 'index.ts')], {
      cwd: deployDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        HOST: '127.0.0.1',
        TRUST_PROXY: 'false',
        SECURE_COOKIES: 'false',
        ARSENAL_DATA_DIR: dataDir,
        BASE_DOMAIN: 'darkavianlabs.com',
        CLERK_PUBLISHABLE_KEY: '',
        CLERK_SECRET_KEY: '',
        CLERK_WEBHOOK_SIGNING_SECRET: '',
        SENTINEL_INGEST_TOKEN: '',
        SENTINEL_INGEST_URL: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (d) => output.push(String(d)));
    child.stderr?.on('data', (d) => output.push(String(d)));

    const ready = await waitForReady(port);
    for (const appName of ['codex', 'armory', 'outfitter', 'budget-planner']) {
      if (!ready?.apps?.[appName]) {
        throw new Error(`/readyz reported ${appName} not ready: ${JSON.stringify(ready)}`);
      }
    }

    const health = await httpGet(port, '/healthz');
    if (health.status !== 200) throw new Error(`/healthz failed: ${health.status}`);

    const version = await httpGet(port, '/api/version');
    if (version.status !== 200) throw new Error(`/api/version failed: ${version.status}`);

    // Verify all 4 subdomains route cleanly through the deployed node_modules JS builds
    // and actually serve their own distinct SPAs (not falling back to default app).
    const hostChecks = [
      { host: 'codex.darkavianlabs.com', expectBody: /codex/i },
      { host: 'armory.darkavianlabs.com', expectBody: /armory/i },
      {
        host: 'outfitter.darkavianlabs.com',
        expectBody: /outfitter/i,
        check: (res) => {
          const csp = String(res.headers['content-security-policy'] ?? '');
          if (!csp.includes("'wasm-unsafe-eval'")) {
            throw new Error(`Outfitter CSP missing 'wasm-unsafe-eval': ${csp}`);
          }
        },
      },
      { host: 'budget.darkavianlabs.com', expectBody: /budget/i },
    ];

    for (const { host, expectBody, check } of hostChecks) {
      const res = await httpGet(port, '/', { Host: host });
      if (res.status !== 200) {
        throw new Error(`${host}/ returned HTTP ${res.status}`);
      }
      if (!expectBody.test(res.body)) {
        throw new Error(`${host}/ body did not match ${expectBody}`);
      }
      check?.(res);
    }

    // Verify Armory initialized builds.db (createUserSchema ran) and keeps armory.db separate.
    if (!fs.existsSync(path.join(dataDir, 'builds.db'))) {
      throw new Error('Expected Armory builds.db to be initialized on boot');
    }
    if (!fs.existsSync(path.join(dataDir, 'armory.db'))) {
      throw new Error(
        'Expected Armory armory.db to be initialized separately from warframe-catalog.db',
      );
    }

    console.log('[smoke] Deployed Arsenal bundle booted and passed all 4 host checks.');
  } catch (err) {
    if (output.length > 0) {
      console.error('--- Deployed host output ---\n' + output.join(''));
    }
    throw err;
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 300));
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[smoke] FAILED:', err);
  process.exit(1);
});
