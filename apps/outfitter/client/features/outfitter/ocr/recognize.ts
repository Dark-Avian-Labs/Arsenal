import {
  parseArtifactOcr,
  type ArtifactCatalogRef,
  type ParsedArtifactOcr,
} from '@shared/artifactOcr';
import { mergeGearOcr, parseGearOcr, type OcrHeroRef, type ParsedGearOcr } from '@shared/gearOcr';
import { createWorker, PSM, type Worker } from 'tesseract.js';

const CHAR_WHITELIST = "0123456789.%ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz ':-+";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng', 1, {
        langPath: '/tessdata',
        gzip: true,
      });
      await worker.setParameters({
        tessedit_char_whitelist: CHAR_WHITELIST,
      });
      return worker;
    })();
  }
  try {
    return await workerPromise;
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}

async function recognizePsm(
  worker: Worker,
  image: string,
  psm: PSM,
  heroes: readonly OcrHeroRef[],
): Promise<{ text: string } & ParsedGearOcr> {
  await worker.setParameters({
    tessedit_char_whitelist: CHAR_WHITELIST,
    tessedit_pageseg_mode: psm,
  });
  const text = (await worker.recognize(image)).data.text ?? '';
  return { text, ...parseGearOcr(text, heroes) };
}

export function decodeGearScreenshot(image: unknown): string {
  if (typeof image !== 'string' || image.length === 0) return 'Paste a gear screenshot.';
  const match = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(image);
  if (!match?.[2]) return 'Paste a PNG or JPEG screenshot.';
  const payload = match[2].replace(/\s+/g, '');
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((payload.length * 3) / 4) - padding;
  if (bytes <= 0) return 'Paste a PNG or JPEG screenshot.';
  if (bytes > 5 * 1024 * 1024) return 'Screenshot is too large (max 5 MB).';
  return image;
}

function mergeArtifactOcr(base: ParsedArtifactOcr, extra: ParsedArtifactOcr): ParsedArtifactOcr {
  return {
    catalog_slug: base.catalog_slug ?? extra.catalog_slug,
    level: base.level ?? extra.level,
    promotion: base.promotion ?? extra.promotion,
    hp_base: base.hp_base ?? extra.hp_base,
    hp_bonus: base.hp_bonus ?? extra.hp_bonus,
    atk_base: base.atk_base ?? extra.atk_base,
    atk_bonus: base.atk_bonus ?? extra.atk_bonus,
    secondary_stat: base.secondary_stat ?? extra.secondary_stat,
    secondary_value: base.secondary_value ?? extra.secondary_value,
  };
}

export async function recognizeArtifactStats(
  image: string,
  catalog: readonly ArtifactCatalogRef[] = [],
): Promise<{ text: string } & ParsedArtifactOcr> {
  const worker = await getWorker();
  async function pass(psm: PSM): Promise<{ text: string } & ParsedArtifactOcr> {
    await worker.setParameters({
      tessedit_char_whitelist: CHAR_WHITELIST + '/',
      tessedit_pageseg_mode: psm,
    });
    const text = (await worker.recognize(image)).data.text ?? '';
    return { text, ...parseArtifactOcr(text, catalog) };
  }
  const column = await pass(PSM.SINGLE_COLUMN);
  const block = await pass(PSM.SINGLE_BLOCK);
  const merged = { text: `${column.text}\n${block.text}`, ...mergeArtifactOcr(column, block) };
  if (merged.hp_base != null && merged.atk_base != null && merged.catalog_slug) return merged;
  const sparse = await pass(PSM.SPARSE_TEXT);
  return {
    text: `${merged.text}\n${sparse.text}`,
    ...mergeArtifactOcr(merged, sparse),
  };
}

export async function recognizeGearStats(
  image: string,
  heroes: readonly OcrHeroRef[] = [],
): Promise<{ text: string } & ParsedGearOcr> {
  const worker = await getWorker();
  const column = await recognizePsm(worker, image, PSM.SINGLE_COLUMN, heroes);
  const block = await recognizePsm(worker, image, PSM.SINGLE_BLOCK, heroes);
  const merged = mergeGearOcr(column, block);
  if (merged.stats.length >= 5 && merged.set_key && merged.slot) return merged;
  const sparse = await recognizePsm(worker, image, PSM.SPARSE_TEXT, heroes);
  return mergeGearOcr(merged, sparse);
}
