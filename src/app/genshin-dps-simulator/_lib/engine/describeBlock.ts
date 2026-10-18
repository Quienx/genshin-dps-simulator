import { Block, BonusBlock, BonusStat } from './schema';
import { getEffectValue, isStatBonus, toEffect } from '../effects';
import formatNumber from '../formatNumber';
import { ParsedValues } from '../types';

// What the activity timeline needs to explain a block in words.
export type DescribeContext = {
  values: ParsedValues;
  scalingStat: 'atk' | 'hp' | 'def';
  rowMultiplier: (ref: string) => number;
  // A status' or resource's name, and whether it reads as a %.
  labelOf: (id: string) => { label: string; percent: boolean } | undefined;
};

export type BlockEffect = {
  // Everything: "+40% DMG Bonus · Pyro hits · while Masque".
  effect: string;
  // The value alone, for the cursor badge: "+40% DMG Bonus".
  short: string;
};

const STAT_NAMES: Record<BonusStat, string> = {
  dmgBonus: 'DMG Bonus',
  critRate: 'CRIT Rate',
  critDamage: 'CRIT DMG',
  flatMultiplier: 'talent multiplier',
  atkPercent: 'ATK',
  hpPercent: 'Max HP',
  defPercent: 'DEF',
  flatAtk: 'ATK',
  flatHp: 'Max HP',
  flatDef: 'DEF',
  elementalMastery: 'EM',
  flatDamage: 'flat DMG',
  defReduction: 'DEF reduction',
  defIgnore: 'DEF ignored',
  resShred: 'RES shred',
};

const FLAT_STATS: BonusStat[] = [
  'flatAtk',
  'flatHp',
  'flatDef',
  'elementalMastery',
  'flatDamage',
];

const SCALING_NAMES = {
  atk: 'ATK',
  hp: 'Max HP',
  def: 'DEF',
  em: 'EM',
  baseAtk: 'Base ATK',
};

const ACTION_NAMES: Record<string, string> = {
  normal: 'Normal Attack',
  charged: 'Charged Attack',
  skill: 'Elemental Skill',
  burst: 'Elemental Burst',
};

const signed = (value: number, unit: string): string =>
  `${value < 0 ? '-' : '+'}${formatNumber(Math.abs(value))}${unit}`;

const describeStat = (
  block: BonusBlock,
  context: DescribeContext
): string | null => {
  if (!isStatBonus(block)) {
    return null;
  }
  const value = getEffectValue(toEffect(block), context.values);
  const stat = block.stat;
  if (block.ofStat) {
    return `${signed(value, '%')} of ${SCALING_NAMES[block.ofStat]} as ${
      STAT_NAMES[stat]
    }`;
  }
  if (stat === 'flatMultiplier') {
    return `${signed(value, '%')} ${
      SCALING_NAMES[context.scalingStat]
    } to the talent multiplier`;
  }
  const unit = FLAT_STATS.includes(stat) ? '' : '%';
  return `${signed(value, unit)} ${STAT_NAMES[stat]}`;
};

const describeKind = (
  block: BonusBlock,
  context: DescribeContext
): string | null => {
  if (block.infuse) {
    return `Hits become ${block.infuse}`;
  }
  if (block.reaction) {
    return `Hits ${block.reaction}`;
  }
  if (block.setCategory) {
    return `Counts as ${block.setCategory}`;
  }
  const extra = block.addMultiplier;
  if (extra) {
    const per = context.labelOf(extra.perResource);
    const unit = per?.percent ? '%' : '';
    return `${signed(context.rowMultiplier(extra.row), '%')} ${
      SCALING_NAMES[context.scalingStat]
    } per ${formatNumber(extra.per)}${unit} ${per?.label ?? extra.perResource}`;
  }
  return describeStat(block, context);
};

const describeStacks = (
  block: BonusBlock,
  context: DescribeContext
): string | null => {
  if (!block.perStack) {
    return null;
  }
  return block.perStack
    .map(({ state, max }) => {
      const label = context.labelOf(state)?.label;
      return `per stack (max ${max}${label ? `, ${label}` : ''})`;
    })
    .join(' × ');
};

const describeMatch = (block: BonusBlock): string | null => {
  const { match } = block;
  if (!match) {
    return null;
  }
  const names = [
    ...(match.actions ?? []).map((id) => ACTION_NAMES[id] ?? id),
    ...(match.categories ?? []),
    ...(match.elements ?? []),
  ];
  return names.length > 0 ? `${names.join(' / ')} hits` : null;
};

const BOUND_SYMBOLS = { gt: '>', gte: '≥', lt: '<', lte: '≤' } as const;

const describeWhile = (
  block: BonusBlock,
  context: DescribeContext
): string | null => {
  const parts = Object.entries(block.while ?? {}).map(([id, bounds]) => {
    const target = context.labelOf(id);
    const label = target?.label ?? id;
    const unit = target?.percent ? '%' : '';
    // A status "≥ 1" just means it is up.
    if (
      !target?.percent &&
      bounds.gte === 1 &&
      Object.keys(bounds).length === 1
    ) {
      return label;
    }
    const conditions = (
      Object.keys(BOUND_SYMBOLS) as (keyof typeof BOUND_SYMBOLS)[]
    )
      .filter((key) => bounds[key] !== undefined)
      .map(
        (key) =>
          `${BOUND_SYMBOLS[key]} ${formatNumber(bounds[key] ?? 0)}${unit}`
      );
    return `${label} ${conditions.join(' and ')}`;
  });
  return parts.length > 0 ? `while ${parts.join(' and ')}` : null;
};

// A bonus in words, from its own data and the run's values (refinement,
// talent level). Other blocks are explained by their rows' data.
export const describeEffect = (
  block: Block,
  context: DescribeContext
): BlockEffect | undefined => {
  if (block.type !== 'bonus') {
    return undefined;
  }
  const kind = describeKind(block, context);
  if (!kind) {
    return undefined;
  }
  const value = [kind, describeStacks(block, context)]
    .filter(Boolean)
    .join(' ');
  const effect = [
    value,
    describeMatch(block),
    describeWhile(block, context),
    block.teamBuff === 'everyone'
      ? 'for her and the party'
      : block.teamBuff
      ? 'for the party (not her own hits)'
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { effect, short: kind };
};
