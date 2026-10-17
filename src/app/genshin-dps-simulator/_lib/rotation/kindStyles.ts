import { RotationActionKind } from './rotationSchema';

type KindStyle = {
  // Timeline piece and palette item colors.
  chip: string;
  // Solid fill for the time strip and its legend swatches.
  bar: string;
};

export const KIND_STYLES: Record<RotationActionKind, KindStyle> = {
  normal: {
    chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    bar: 'bg-sky-500',
  },
  charged: {
    chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  skill: {
    chip: 'border-orange-600/40 bg-orange-600/10 text-orange-700 dark:text-orange-300',
    bar: 'bg-orange-600',
  },
  burst: {
    chip: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    bar: 'bg-violet-500',
  },
  plunge: {
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
  move: {
    chip: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
    bar: 'bg-teal-500',
  },
  dodge: {
    chip: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
    bar: 'bg-zinc-400',
  },
  wait: {
    chip: 'border-dashed border-zinc-500/40 bg-transparent text-muted-foreground',
    bar: 'bg-zinc-300 dark:bg-zinc-600',
  },
};
