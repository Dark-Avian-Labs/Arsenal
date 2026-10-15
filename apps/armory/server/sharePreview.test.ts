import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppBundle } from './app.ts';
import { createApp } from './app.ts';
import { injectSharePreview, toShareImageUrl } from './sharePreview.ts';
import { createMemoryUserDb, insertTestBuild } from './testing/memoryUserDb.ts';

const SHELL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="Warframe mod builds." />
    <meta property="og:title" content="Armory" />
    <title>Armory</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

describe('injectSharePreview', () => {
  it('replaces the shell title and escapes the build name', () => {
    const html = injectSharePreview(SHELL_HTML, {
      title: 'Shield <Gate>',
      description: 'Excalibur & Mesa',
      pageUrl: 'https://armory.darkavianlabs.com/builder/11?view=1',
      imageUrl: 'https://armory.darkavianlabs.com/images/Warframes/Excalibur.png',
    });

    expect(html).toContain('<title>Shield &lt;Gate&gt;</title>');
    expect(html).toContain('property="og:title" content="Shield &lt;Gate&gt;"');
    expect(html).toContain('name="description" content="Excalibur &amp; Mesa"');
    expect(html).toContain(
      'property="og:image" content="https://armory.darkavianlabs.com/images/Warframes/Excalibur.png"',
    );
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).not.toContain('<script>');
  });
});

describe('toShareImageUrl', () => {
  const base = 'https://armory.darkavianlabs.com';

  it('turns a catalog image path into an absolute Armory URL', () => {
    expect(toShareImageUrl('/Warframes/Excalibur.png', base)).toBe(
      'https://armory.darkavianlabs.com/images/Warframes/Excalibur.png',
    );
    expect(toShareImageUrl('/images/Warframes/Excalibur.png', `${base}/`)).toBe(
      'https://armory.darkavianlabs.com/images/Warframes/Excalibur.png',
    );
  });

  it('keeps an allowlisted https image and drops anything else', () => {
    expect(toShareImageUrl('https://content.warframe.com/PublicExport/Lotus/foo.png', base)).toBe(
      'https://content.warframe.com/PublicExport/Lotus/foo.png',
    );
    expect(toShareImageUrl('https://evil.example/x.png', base)).toBeNull();
    expect(toShareImageUrl('javascript:alert(1)', base)).toBeNull();
  });
});

describe('GET /builder/:id share preview', () => {
  let clientDir: string | undefined;
  let bundle: AppBundle | undefined;
  let catalogDb: Database.Database | undefined;
  let userDb: Database.Database | undefined;
  let publicId = 0;
  let privateId = 0;
  let unlistedId = 0;

  beforeAll(() => {
    clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armory-share-'));
    fs.writeFileSync(path.join(clientDir, 'index.html'), SHELL_HTML);
    process.env.E2E_CLIENT_DIR = clientDir;

    catalogDb = new Database(':memory:');
    catalogDb.exec(`
      CREATE TABLE warframes (unique_name TEXT PRIMARY KEY, name TEXT, image_path TEXT);
      CREATE TABLE weapons (unique_name TEXT PRIMARY KEY, name TEXT, image_path TEXT);
      CREATE TABLE companions (unique_name TEXT PRIMARY KEY, name TEXT, image_path TEXT);
      INSERT INTO warframes (unique_name, name, image_path)
      VALUES ('/Lotus/Powersuits/Excalibur/Excalibur', 'Excalibur', '/Warframes/Excalibur.png');
    `);
    userDb = createMemoryUserDb();
    publicId = insertTestBuild(userDb, { name: 'Shield Gate', visibility: 'public' });
    userDb.prepare('UPDATE builds SET description = ? WHERE id = ?').run('Viral primer', publicId);
    privateId = insertTestBuild(userDb, {
      name: 'PrivateBuildSecretName',
      visibility: 'private',
    });
    unlistedId = insertTestBuild(userDb, {
      name: 'Unlisted Gate',
      visibility: 'unlisted',
      shareToken: 'share-token',
    });
    bundle = createApp({ catalogDb, userDb });
  });

  afterAll(() => {
    catalogDb?.close();
    userDb?.close();
    if (clientDir) fs.rmSync(clientDir, { recursive: true, force: true });
    delete process.env.E2E_CLIENT_DIR;
  });

  it('puts the build name and equipment image on a public build', async () => {
    const res = await request(bundle!.app).get(`/builder/${publicId}?view=1`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<title>Shield Gate</title>');
    expect(res.text).toContain('property="og:title" content="Shield Gate"');
    expect(res.text).toContain('content="Excalibur. Viral primer"');
    expect(res.text).toContain('property="og:image" content="http://127.0.0.1:3002/images/Warframes/Excalibur.png"');
    expect(res.text).toContain(`property="og:url" content="http://127.0.0.1:3002/builder/${publicId}?view=1"`);
  });

  it('keeps a private build name out of the page', async () => {
    const res = await request(bundle!.app).get(`/builder/${privateId}?view=1`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Armory</title>');
    expect(res.text).not.toContain('PrivateBuildSecretName');
  });

  it('shows an unlisted build only when the share token is present', async () => {
    const hidden = await request(bundle!.app).get(`/builder/${unlistedId}?view=1`);
    expect(hidden.text).not.toContain('Unlisted Gate');

    const shown = await request(bundle!.app).get(`/builder/${unlistedId}?view=1&token=share-token`);
    expect(shown.text).toContain('<title>Unlisted Gate</title>');
    expect(shown.text).toContain(`token=share-token`);
  });

  it('leaves catalog routes on the generic shell', async () => {
    const res = await request(bundle!.app).get('/builder/builds');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Armory</title>');
  });
});
