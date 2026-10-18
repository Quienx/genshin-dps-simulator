// What the scaffold scripts share: Project Amber and gcsim fetching, the
// level 90 maths, Amber's names in the files' terms, and writing a draft.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// GCSIM_SOURCE=<owner/repo>@<branch> reads a fork instead (a character only
// in an open pull request: dersario/gcsim@nefer).
const [GCSIM_REPO, GCSIM_REF] = (
  process.env.GCSIM_SOURCE ?? 'genshinsim/gcsim@main'
).split('@');
export const GCSIM = `https://raw.githubusercontent.com/${GCSIM_REPO}/${GCSIM_REF}`;
export const GCSIM_API = `https://api.github.com/repos/${GCSIM_REPO}/contents/internal`;
// The contents API reads the branch from `?ref=`.
export const GCSIM_API_REF = `?ref=${GCSIM_REF}`;
export const AMBER = 'https://gi.yatta.moe/api/v2/en';
// Curves have no language.
const AMBER_STATIC = 'https://gi.yatta.moe/api/v2/static';

// The simulator's data folder, where the catalog lives.
export const DATA = join(
  __dirname,
  '../../src/app/genshin-dps-simulator/_data'
);
// Where drafts go (not loaded by the app).
export const DRAFTS = join(__dirname, '../scaffolds');

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const WEAPON_TYPES: Record<string, string> = {
  WEAPON_SWORD_ONE_HAND: 'Sword',
  WEAPON_CLAYMORE: 'Claymore',
  WEAPON_POLE: 'Polearm',
  WEAPON_CATALYST: 'Catalyst',
  WEAPON_BOW: 'Bow',
};
// Project Amber's stat names → the files' screen stats.
export const SCREEN_STATS: Record<string, string> = {
  FIGHT_PROP_CRITICAL: 'critRate',
  FIGHT_PROP_CRITICAL_HURT: 'critDamage',
  FIGHT_PROP_ATTACK_PERCENT: 'atkPercent',
  FIGHT_PROP_HP_PERCENT: 'hpPercent',
  FIGHT_PROP_DEFENSE_PERCENT: 'defPercent',
  FIGHT_PROP_ELEMENT_MASTERY: 'elementalMastery',
  FIGHT_PROP_CHARGE_EFFICIENCY: 'energyRecharge',
};

// A stat in the files' unit: percents ×100, EM as is, one decimal.
export const screenValue = (prop: string, value: number) =>
  Math.round(value * (prop.endsWith('MASTERY') ? 1 : 100) * 10) / 10;

export const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} for ${url}`);
  }
  return response.text();
};
export const fetchJson = async (url: string): Promise<Json> =>
  JSON.parse(await fetchText(url));

// Amber's text without its markup and links.
export const plain = (raw: string | undefined) =>
  (raw ?? '')
    .replace(/\{LINK#[^}]*\}/g, '')
    .replace(/\{\/LINK\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\\n/g, '\n')
    .trim();

// "Scroll of the Hero of Cinder City" → "scroll-of-the-hero-of-cinder-city"
export const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// "A Thousand Blazing Suns" → "thousandBlazingSuns" (flags and fields).
export const camel = (name: string) => {
  const words = slug(name)
    .split('-')
    .filter((word, index) => !(index === 0 && ['a', 'the'].includes(word)));
  return words
    .map((word, index) =>
      index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('');
};

export const findByName = async (kind: string, name: string) => {
  const items: Record<string, Json> = (await fetchJson(`${AMBER}/${kind}`)).data
    .items;
  const found = Object.entries(items).find(
    ([, item]) => String(item.name).toLowerCase() === name.toLowerCase()
  );
  if (!found) {
    throw new Error(`Project Amber has no ${kind} named "${name}"`);
  }
  return (await fetchJson(`${AMBER}/${kind}/${found[0]}`)).data as Json;
};

// Level 90 value of each base stat: its curve at 90 plus the last ascension.
export const level90 = async (
  upgrade: Json,
  kind: 'avatarCurve' | 'weaponCurve'
): Promise<Record<string, number>> => {
  const data = (await fetchJson(`${AMBER_STATIC}/${kind}`)).data;
  const curve = (data['90'].curveInfos ?? data['90']) as Record<string, number>;
  const added: Record<string, number> = upgrade.promote.at(-1).addProps ?? {};
  return Object.fromEntries(
    upgrade.prop.map((prop: Json) => [
      prop.propType,
      prop.initValue * curve[prop.type] + (added[prop.propType] ?? 0),
    ])
  );
};

// Whether the simulator's catalog already has this weapon or set.
export const inCatalog = (folder: 'weapons' | 'sets', id: string) =>
  existsSync(join(DATA, folder, `${id}.json`));

export const option = (args: string[], flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

export const writeDraft = (out: string, draft: unknown) => {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(draft, null, 2)}\n`);
};

export const run = (main: () => Promise<void>) =>
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error); // eslint-disable-line no-console
    process.exit(1);
  });
