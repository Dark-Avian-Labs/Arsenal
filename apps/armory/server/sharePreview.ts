import fs from 'node:fs';
import path from 'node:path';

import { getAppPublicBaseUrl, log } from '@dark-avian-labs/server-kit';
import { siriusOrionEquipmentSaveName } from '@dark-avian-labs/warframe-catalog';
import type Database from 'better-sqlite3';
import type { NextFunction, Request, Response } from 'express';

import { canReadBuild } from './buildAccess.ts';
import { NODE_ENV, PROJECT_ROOT } from './config.ts';
import { isAllowedEquipmentImage } from './http/allowedFetchHosts.ts';
import { parseBuildConfig, parseNumericId } from './routes/apiShared.ts';
import { buildReadAccessContext } from './visibilityTokens.ts';

const TITLE_LIMIT = 120;
const DESCRIPTION_LIMIT = 200;

export type SharePreview = {
  title: string;
  description: string;
  pageUrl: string;
  imageUrl?: string;
};

type SharePreviewDeps = {
  userDb: () => Database.Database;
  catalogDb: () => Database.Database;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clip(value: string, limit: number): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 3).trimEnd()}...`;
}

function clientIndexPath(): string {
  const override = NODE_ENV !== 'production' ? process.env.E2E_CLIENT_DIR?.trim() : '';
  const clientDir = override ? path.resolve(override) : path.join(PROJECT_ROOT, 'dist', 'client');
  return path.join(clientDir, 'index.html');
}

function setTitle(html: string, title: string): string {
  const tag = `<title>${escapeHtml(title)}</title>`;
  if (/<title>[^<]*<\/title>/i.test(html)) {
    return html.replace(/<title>[^<]*<\/title>/i, tag);
  }
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

function setMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const tag = `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`;
  const pattern = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`, 'i');
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
}

export function injectSharePreview(html: string, preview: SharePreview): string {
  let next = setTitle(html, preview.title);
  next = setMeta(next, 'name', 'description', preview.description);
  next = setMeta(next, 'property', 'og:type', 'website');
  next = setMeta(next, 'property', 'og:site_name', 'Armory');
  next = setMeta(next, 'property', 'og:title', preview.title);
  next = setMeta(next, 'property', 'og:description', preview.description);
  next = setMeta(next, 'property', 'og:url', preview.pageUrl);
  next = setMeta(next, 'name', 'twitter:card', 'summary');
  next = setMeta(next, 'name', 'twitter:title', preview.title);
  next = setMeta(next, 'name', 'twitter:description', preview.description);
  if (preview.imageUrl) {
    next = setMeta(next, 'property', 'og:image', preview.imageUrl);
    next = setMeta(next, 'name', 'twitter:image', preview.imageUrl);
  }
  return next;
}

export function toShareImageUrl(raw: string | null | undefined, publicBase: string): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed || !isAllowedEquipmentImage(trimmed)) return null;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  const imagePath = trimmed.startsWith('/images/')
    ? trimmed
    : trimmed.startsWith('/')
      ? `/images${trimmed}`
      : `/images/${trimmed}`;
  if (!isAllowedEquipmentImage(imagePath)) return null;
  return `${publicBase.replace(/\/+$/, '')}${imagePath}`;
}

type EquipmentPreview = {
  name: string | null;
  imagePath: string | null;
};

function readCatalogEquipment(catalogDb: Database.Database, uniqueName: string): EquipmentPreview {
  try {
    const row = catalogDb
      .prepare(
        `SELECT name, image_path FROM warframes WHERE unique_name = ?
         UNION ALL
         SELECT name, image_path FROM weapons WHERE unique_name = ?
         UNION ALL
         SELECT name, image_path FROM companions WHERE unique_name = ?
         LIMIT 1`,
      )
      .get(uniqueName, uniqueName, uniqueName) as
      | { name: string | null; image_path: string | null }
      | undefined;
    return {
      name: row?.name?.trim() || null,
      imagePath: row?.image_path?.trim() || null,
    };
  } catch (err) {
    log('warn', 'Share preview catalog lookup failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { name: null, imagePath: null };
  }
}

function readStoredEquipment(modConfig: string): EquipmentPreview {
  const parsed = parseBuildConfig(modConfig);
  const name = typeof parsed?.equipment_name === 'string' ? parsed.equipment_name.trim() : '';
  const image = typeof parsed?.equipment_image === 'string' ? parsed.equipment_image.trim() : '';
  return {
    name: name && !name.startsWith('/') ? name : null,
    imagePath: image || null,
  };
}

function previewDescription(title: string, equipmentName: string, note: string): string {
  const sameName = equipmentName.toLowerCase() === title.toLowerCase();
  if (!sameName && equipmentName && note)
    return clip(`${equipmentName}. ${note}`, DESCRIPTION_LIMIT);
  if (!sameName && equipmentName) return equipmentName;
  if (note) return clip(note, DESCRIPTION_LIMIT);
  return 'Warframe mod build.';
}

function loadSharePreview(
  deps: SharePreviewDeps,
  buildId: number,
  req: Request,
  publicBase: string,
): SharePreview | null {
  const row = deps
    .userDb()
    .prepare(
      `SELECT id, clerk_user_id, name, description, visibility, share_token, equipment_unique_name, mod_config
     FROM builds WHERE id = ?`,
    )
    .get(buildId) as
    | {
        clerk_user_id: string;
        name: string;
        description: string | null;
        visibility: string | null;
        share_token: string | null;
        equipment_unique_name: string;
        mod_config: string;
      }
    | undefined;
  if (!row) return null;
  const access = buildReadAccessContext(req, null, false);
  if (!canReadBuild(row, access)) return null;

  const catalog = readCatalogEquipment(deps.catalogDb(), row.equipment_unique_name);
  const stored = readStoredEquipment(row.mod_config);
  const equipmentName = siriusOrionEquipmentSaveName({
    unique_name: row.equipment_unique_name,
    name: catalog.name ?? stored.name,
  });
  const title = clip(row.name, TITLE_LIMIT) || 'Armory';
  const note = typeof row.description === 'string' ? row.description : '';
  const pageUrl = new URL(`/builder/${buildId}`, publicBase);
  pageUrl.searchParams.set('view', '1');
  if ((row.visibility ?? 'private') === 'unlisted' && access.shareToken) {
    pageUrl.searchParams.set('token', access.shareToken);
  }
  const imageUrl = toShareImageUrl(catalog.imagePath ?? stored.imagePath, publicBase);
  return {
    title,
    description: previewDescription(title, equipmentName, note),
    pageUrl: pageUrl.toString(),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

export function buildSharePreview(
  req: Request,
  res: Response,
  next: NextFunction,
  deps: SharePreviewDeps,
): void {
  const buildId = parseNumericId(req.params.buildId);
  if (buildId === null) {
    next();
    return;
  }

  try {
    const preview = loadSharePreview(deps, buildId, req, getAppPublicBaseUrl());
    if (!preview) {
      next();
      return;
    }
    const indexPath = clientIndexPath();
    if (!fs.existsSync(indexPath)) {
      next();
      return;
    }
    const html = injectSharePreview(fs.readFileSync(indexPath, 'utf8'), preview);
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(html);
  } catch (err) {
    log('warn', 'Share preview skipped', {
      err: err instanceof Error ? err.message : String(err),
    });
    next();
  }
}
