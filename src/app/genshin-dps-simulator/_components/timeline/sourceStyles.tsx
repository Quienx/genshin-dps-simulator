import { memo } from 'react';

import { cn } from '@/lib/utils';

import { BlockChip } from '../../_lib/inspector';
import { RotationActionKind } from '../../_lib/rotation/rotationSchema';

// Where something comes from, as the timeline colors it: each talent
// (Normal, Charged, Plunge, Skill, Burst) and each other source, each in
// a hue of its own (one green, one blue…) so the bars read apart.
export type SourceKind =
  | 'normal'
  | 'charged'
  | 'plunge'
  | 'skill'
  | 'burst'
  // A talent block whose talent is not known (no action made it).
  | 'talent'
  | 'passive'
  | 'constellation'
  | 'weapon'
  | 'artifact'
  | 'system'
  | 'other';

type SourceStyle = {
  label: string;
  // A bar or a stripe (and the legend's dot).
  bar: string;
  // A buff's or debuff's bar on its row: see-through, with a border.
  track: string;
  // An action's rectangle: border, fill and text.
  chip: string;
};

// Each element's text color (an aura, a hit's element): the same in every
// panel.
export const ELEMENT_TEXT: Record<string, string> = {
  Pyro: 'text-orange-400',
  Electro: 'text-violet-400',
  Hydro: 'text-sky-400',
  Cryo: 'text-cyan-300',
  Dendro: 'text-lime-400',
  Anemo: 'text-teal-300',
  Geo: 'text-yellow-400',
  Physical: 'text-slate-300',
};

export const SOURCE_STYLES: Record<SourceKind, SourceStyle> = {
  normal: {
    label: 'Normal',
    bar: 'bg-blue-500',
    chip: 'border-blue-400/60 bg-blue-500/25 text-blue-100',
    track: 'border border-blue-400/70 bg-blue-500/25',
  },
  charged: {
    label: 'Charged',
    bar: 'bg-yellow-400',
    chip: 'border-yellow-300/60 bg-yellow-400/25 text-yellow-100',
    track: 'border border-yellow-300/70 bg-yellow-400/25',
  },
  plunge: {
    label: 'Plunge',
    bar: 'bg-red-500',
    chip: 'border-red-400/60 bg-red-500/25 text-red-100',
    track: 'border border-red-400/70 bg-red-500/25',
  },
  skill: {
    label: 'Skill (E)',
    bar: 'bg-orange-500',
    chip: 'border-orange-400/60 bg-orange-500/25 text-orange-100',
    track: 'border border-orange-400/70 bg-orange-500/25',
  },
  burst: {
    label: 'Burst (Q)',
    bar: 'bg-violet-500',
    chip: 'border-violet-400/60 bg-violet-500/25 text-violet-100',
    track: 'border border-violet-400/70 bg-violet-500/25',
  },
  talent: {
    label: 'Talent',
    bar: 'bg-slate-400',
    chip: 'border-slate-300/60 bg-slate-400/25 text-slate-100',
    track: 'border border-slate-300/70 bg-slate-400/25',
  },
  passive: {
    label: 'Passive',
    bar: 'bg-green-500',
    chip: 'border-green-400/60 bg-green-500/25 text-green-100',
    track: 'border border-green-400/70 bg-green-500/25',
  },
  constellation: {
    label: 'Constellation',
    bar: 'bg-fuchsia-500',
    chip: 'border-fuchsia-400/60 bg-fuchsia-500/25 text-fuchsia-100',
    track: 'border border-fuchsia-400/70 bg-fuchsia-500/25',
  },
  weapon: {
    label: 'Weapon',
    bar: 'bg-cyan-400',
    chip: 'border-cyan-300/60 bg-cyan-400/25 text-cyan-100',
    track: 'border border-cyan-300/70 bg-cyan-400/25',
  },
  artifact: {
    label: 'Set',
    bar: 'bg-pink-300',
    chip: 'border-pink-200/60 bg-pink-300/25 text-pink-50',
    track: 'border border-pink-200/70 bg-pink-300/25',
  },
  system: {
    label: 'System',
    bar: 'bg-slate-100',
    chip: 'border-slate-100/60 bg-slate-100/20 text-slate-50',
    track: 'border border-slate-100/70 bg-slate-100/25',
  },
  other: {
    label: 'Other',
    bar: 'bg-slate-600',
    chip: 'border-slate-500/50 bg-slate-600/25 text-slate-100',
    track: 'border border-slate-500/70 bg-slate-600/25',
  },
};

// A talent block's own talent comes from its tag (E, Q, Normal, CA,
// Plunge), else from the action that made it (`causeKind`: Apex Drive is
// made by a plunge); the other sources are the block's `source`.
const TAG_KINDS: Record<string, SourceKind> = {
  E: 'skill',
  Q: 'burst',
  Normal: 'normal',
  CA: 'charged',
  Plunge: 'plunge',
};

export const sourceKindOfChip = (
  chip: Pick<BlockChip, 'source' | 'sourceTag'>,
  causeKind?: RotationActionKind
): SourceKind => {
  if (TAG_KINDS[chip.sourceTag]) {
    return TAG_KINDS[chip.sourceTag];
  }
  if (chip.source === 'talent') {
    return causeKind && causeKind in SOURCE_STYLES
      ? (causeKind as SourceKind)
      : 'talent';
  }
  if (/^C[1-6]$/.test(chip.sourceTag) || chip.source === 'constellation') {
    return 'constellation';
  }
  if (/^A[14]$/.test(chip.sourceTag) || chip.source === 'passive') {
    return 'passive';
  }
  if (chip.source in SOURCE_STYLES) {
    return chip.source as SourceKind;
  }
  return 'other';
};

export const sourceKindOfAction = (
  kind: RotationActionKind | undefined
): SourceKind =>
  kind && kind in SOURCE_STYLES ? (kind as SourceKind) : 'other';

// The colors' key, for the timeline's header.
export const SourceLegend = memo(function SourceLegend({
  className,
}: {
  className?: string;
}) {
  return (
    <ul
      aria-label='Colors by source'
      className={cn(
        // The chart's own legend: chart-sized text, so it stays on one line
        // beside the panel's buttons.
        'flex flex-wrap items-center gap-x-2.5 gap-y-1 text-3xs text-subtle',
        className
      )}
    >
      {(Object.keys(SOURCE_STYLES) as SourceKind[])
        .filter((kind) => kind !== 'other')
        .map((kind) => (
          <li key={kind} className='flex items-center gap-1'>
            <span
              className={cn('size-2 rounded-full', SOURCE_STYLES[kind].bar)}
            />
            {SOURCE_STYLES[kind].label}
          </li>
        ))}
    </ul>
  );
});
