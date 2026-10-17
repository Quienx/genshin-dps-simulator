import { DamageContext } from './types';

export type CategoryShare = {
  category: string;
  damage: number;
  share: number;
};

export const getCategoryShares = (context: DamageContext): CategoryShare[] =>
  Object.entries(context.damageByCategory)
    .map(([category, damage]) => ({
      category,
      damage,
      share: (damage / Math.max(1, context.totalDamage)) * 100,
    }))
    .sort((first, second) => second.damage - first.damage);

export const formatMeterSeconds = (seconds: number): string =>
  `${seconds.toFixed(2)}s`;

const SHARE_SEGMENT_CLASS_NAMES = [
  'bg-primary',
  'bg-primary/65',
  'bg-primary/40',
  'bg-primary/20',
  'bg-muted-foreground/40',
  'bg-muted-foreground/20',
];

export const getShareSegmentClassName = (rank: number): string =>
  SHARE_SEGMENT_CLASS_NAMES[rank % SHARE_SEGMENT_CLASS_NAMES.length];
