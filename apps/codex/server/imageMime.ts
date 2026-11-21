import path from 'node:path';

export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg'] as const;
export type AllowedImageExtension = (typeof ALLOWED_IMAGE_EXTENSIONS)[number];

const ALLOWED_IMAGE_EXT_SET = new Set<string>(ALLOWED_IMAGE_EXTENSIONS);

const IMAGE_CONTENT_TYPES: Record<AllowedImageExtension, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export function contentTypeForImagePath(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase() as AllowedImageExtension;
  return IMAGE_CONTENT_TYPES[ext] ?? null;
}

export function isAllowedImageExtension(ext: string): boolean {
  return ALLOWED_IMAGE_EXT_SET.has(ext.toLowerCase());
}
