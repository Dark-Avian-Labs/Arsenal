import { parseBuildConfig } from './routes/apiShared.ts';

type CardSlot = {
  name: string;
  rank: number | null;
  polarity: string | null;
  slotType: string;
};

export interface BuildCardInput {
  buildName: string;
  equipmentName: string;
  equipmentType: string;
  ownerName: string;
  description: string | null;
  modConfigRaw: string;
}

const POLARITY_LABEL: Record<string, string> = {
  AP_ATTACK: 'Madurai',
  AP_DEFENSE: 'Vazarin',
  AP_TACTIC: 'Naramon',
  AP_POWER: 'Zenurik',
  AP_WARD: 'Unairu',
  AP_UMBRA: 'Umbra',
  AP_ANY: 'Aura',
  AP_PRECEPT: 'Penjaga',
  AP_UNIVERSAL: 'Omni',
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function extractCardSummary(modConfigRaw: string): {
  slots: CardSlot[];
  arcanes: string[];
  formaCount: number;
  orokin: boolean;
  helminth: string | null;
} {
  const parsed = parseBuildConfig(modConfigRaw);
  const rawSlots = Array.isArray(parsed?.slots) ? (parsed.slots as Record<string, unknown>[]) : [];
  const slots: CardSlot[] = [];
  let formaCount = 0;

  for (const s of rawSlots) {
    if (!s || typeof s !== 'object') continue;
    if (s.forma === true || (typeof s.polarity === 'string' && s.formaApplied === true)) {
      formaCount += 1;
    }
    const mod = s.mod as Record<string, unknown> | null | undefined;
    const modName =
      typeof mod?.name === 'string'
        ? mod.name.trim()
        : typeof s.modName === 'string'
          ? s.modName.trim()
          : '';
    if (!modName) continue;
    const rank = typeof s.rank === 'number' && Number.isFinite(s.rank) ? s.rank : null;
    const polarity =
      typeof s.polarity === 'string' ? (POLARITY_LABEL[s.polarity] ?? s.polarity) : null;
    const slotType = typeof s.slotType === 'string' ? s.slotType : 'normal';
    slots.push({ name: modName, rank, polarity, slotType });
  }

  const rawArcanes = Array.isArray(parsed?.arcanes)
    ? (parsed.arcanes as Record<string, unknown>[])
    : [];
  const arcanes: string[] = [];
  for (const a of rawArcanes) {
    const arcane = a?.arcane as Record<string, unknown> | undefined;
    const name =
      typeof arcane?.name === 'string'
        ? arcane.name.trim()
        : typeof a?.name === 'string'
          ? a.name.trim()
          : '';
    if (name) arcanes.push(name);
  }

  const helminthObj = parsed?.helminth as Record<string, unknown> | undefined;
  const helminth =
    typeof helminthObj?.abilityName === 'string' && helminthObj.abilityName.trim()
      ? helminthObj.abilityName.trim()
      : null;

  return {
    slots: slots.slice(0, 10),
    arcanes: arcanes.slice(0, 2),
    formaCount,
    orokin: parsed?.orokinReactor === true,
    helminth,
  };
}

export function renderBuildCardSvg(input: BuildCardInput): string {
  const { slots, arcanes, formaCount, orokin, helminth } = extractCardSummary(input.modConfigRaw);
  const title = escapeXml(truncate(input.buildName || 'Armory Build', 46));
  const equipment = escapeXml(truncate(input.equipmentName || input.equipmentType, 36));
  const owner = escapeXml(truncate(input.ownerName || 'Tenno', 28));
  const desc = input.description ? escapeXml(truncate(input.description, 88)) : '';

  const badges: string[] = [];
  badges.push(input.equipmentType.replace(/_/g, ' ').toUpperCase());
  if (orokin) badges.push('REACTOR / CATALYST');
  if (formaCount > 0) badges.push(`${formaCount} FORMA`);
  if (helminth) badges.push(`HELMINTH: ${truncate(helminth, 22).toUpperCase()}`);

  const badgeMarkup = badges
    .slice(0, 4)
    .map((label, idx) => {
      const x = 56 + idx * 246;
      return `
    <g transform="translate(${x}, 152)">
      <rect width="232" height="34" rx="8" fill="#182032" stroke="#33415c" stroke-width="1" />
      <text x="14" y="22" fill="#cbd5e1" font-size="13" font-weight="600" letter-spacing="0.06em">${escapeXml(truncate(label, 24))}</text>
    </g>`;
    })
    .join('');

  const slotCards = Array.from({ length: 10 }, (_, idx) => {
    const slot = slots[idx];
    const col = idx % 5;
    const row = Math.floor(idx / 5);
    const x = 56 + col * 220;
    const y = 216 + row * 124;
    if (!slot) {
      return `
    <g transform="translate(${x}, ${y})">
      <rect width="206" height="108" rx="12" fill="#0f1522" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="6 4" />
      <text x="103" y="60" text-anchor="middle" fill="#475569" font-size="13">Empty Slot</text>
    </g>`;
    }
    const accent =
      slot.slotType === 'aura' || slot.slotType === 'stance'
        ? '#f59e0b'
        : slot.slotType === 'exilus'
          ? '#38bdf8'
          : '#818cf8';
    const rankLabel = slot.rank !== null ? `R${slot.rank}` : '';
    const polLabel = slot.polarity ? truncate(slot.polarity, 10) : '';
    return `
    <g transform="translate(${x}, ${y})">
      <rect width="206" height="108" rx="12" fill="#141c2d" stroke="${accent}" stroke-opacity="0.55" stroke-width="1.5" />
      <rect x="0" y="0" width="206" height="5" rx="2" fill="${accent}" />
      <text x="14" y="34" fill="#f8fafc" font-size="15" font-weight="600">${escapeXml(truncate(slot.name, 20))}</text>
      <text x="14" y="60" fill="#94a3b8" font-size="12">${escapeXml(slot.slotType.toUpperCase())}</text>
      <text x="14" y="90" fill="#cbd5e1" font-size="13" font-weight="600">${escapeXml(polLabel)}</text>
      <text x="192" y="90" text-anchor="end" fill="${accent}" font-size="14" font-weight="700">${escapeXml(rankLabel)}</text>
    </g>`;
  }).join('');

  const arcaneLine =
    arcanes.length > 0
      ? `Arcanes: ${arcanes.map((a) => truncate(a, 28)).join(' · ')}`
      : `${slots.length} equipped mod${slots.length === 1 ? '' : 's'}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${title} — ${equipment}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1020" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect x="0" y="0" width="1200" height="6" fill="url(#accent)" />
  <g font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">
    <text x="56" y="64" fill="#818cf8" font-size="15" font-weight="700" letter-spacing="0.14em">DARK AVIAN LABS · ARMORY</text>
    <text x="1144" y="64" text-anchor="end" fill="#94a3b8" font-size="15">by ${owner}</text>
    <text x="56" y="108" fill="#f8fafc" font-size="38" font-weight="700">${title}</text>
    <text x="56" y="138" fill="#94a3b8" font-size="20" font-weight="500">${equipment}</text>
    ${badgeMarkup}
    ${slotCards}
    <line x1="56" y1="494" x2="1144" y2="494" stroke="#1e293b" stroke-width="1" />
    <text x="56" y="534" fill="#cbd5e1" font-size="17" font-weight="600">${escapeXml(arcaneLine)}</text>
    ${desc ? `<text x="56" y="572" fill="#94a3b8" font-size="15">${desc}</text>` : ''}
    <text x="1144" y="596" text-anchor="end" fill="#64748b" font-size="14">armory.darkavianlabs.com</text>
  </g>
</svg>`;
}
