import { Clock } from 'lucide-react';
import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { describeSystemStatus, describeTrigger, meterAt } from './timelineData';
import formatNumber from '../../_lib/formatNumber';
import { BlockChip, spanAt, timerEnd } from '../../_lib/inspector';

export const tipSeconds = (value: number) =>
  `${formatNumber(Math.round(value * 100) / 100)} s`;

export type TipOwner = { name: string; avatar: string };

type TipCardProps = {
  icon: ReactNode;
  title: string;
  owner?: TipOwner | null;
  // Where it comes from (E, Q, C6, Weapon…) or what it is.
  badge?: string | null;
  // What it gives, in big ("+20% ATK"), when known.
  value?: string | null;
  // The member's color, as a thin line on top.
  accentClass?: string;
  children?: ReactNode;
};

// A tooltip as a small card: what it is and whose, then its details.
export const TipCard = ({
  icon,
  title,
  owner,
  badge,
  value,
  accentClass,
  children,
}: TipCardProps) => (
  <div className='w-72 overflow-hidden text-left'>
    {accentClass && <div className={cn('h-0.5', accentClass)} />}
    <div className='flex items-start gap-2.5 p-3'>
      <span className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-white/10'>
        {icon}
      </span>
      <div className='min-w-0 flex-1'>
        <div className='flex items-start justify-between gap-2'>
          <p className='text-sm leading-tight font-semibold text-slate-50'>
            {title}
          </p>
          {badge && (
            <span className='shrink-0 rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-200'>
              {badge}
            </span>
          )}
        </div>
        {owner && (
          <p className='mt-1 flex items-center gap-1.5 text-[11px] text-slate-400'>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={owner.avatar}
              alt=''
              width={16}
              height={16}
              className='size-4 rounded-full bg-slate-700'
            />
            {owner.name}
          </p>
        )}
      </div>
    </div>
    {value && (
      <p className='mx-3 mb-2 rounded-md bg-emerald-500/10 px-2 py-1 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-400/20'>
        {value}
      </p>
    )}
    {children && (
      <div className='flex flex-col gap-1.5 border-t border-slate-700/60 bg-slate-950/40 p-3'>
        {children}
      </div>
    )}
  </div>
);

export const TipStat = ({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) => (
  <div className='flex items-baseline justify-between gap-3 text-xs'>
    <span className='text-slate-400'>{label}</span>
    <span
      className={cn(
        'text-right font-medium text-slate-100 tabular-nums',
        className
      )}
    >
      {value}
    </span>
  </div>
);

// When: one moment, or a span and how long it lasted.
export const TipTime = ({
  start,
  end,
}: {
  start: number;
  end?: number | null;
}) => (
  <div className='flex items-center gap-1.5 text-xs text-slate-300 tabular-nums'>
    <Clock className='size-3.5 text-sky-400' aria-hidden />
    {end === undefined || end === null || end === start ? (
      <span>At {tipSeconds(start)}</span>
    ) : (
      <span>
        {tipSeconds(start)} → {tipSeconds(end)}
        <span className='text-slate-500'> · {tipSeconds(end - start)}</span>
      </span>
    )}
  </div>
);

// The in-game text (or the block's description).
export const TipText = ({
  title,
  children,
}: {
  title?: string | null;
  children: ReactNode;
}) => (
  <div className='mt-1 border-t border-slate-700/40 pt-2 text-[11px] leading-relaxed text-slate-400'>
    {title && <p className='mb-0.5 font-medium text-slate-200'>{title}</p>}
    {/* The whole text: a long one scrolls inside the card (move the
        pointer onto the tooltip and use the wheel). */}
    <p className='max-h-44 overflow-y-auto overscroll-contain pr-1 whitespace-pre-line'>
      {children}
    </p>
  </div>
);

// A block's full card (a buff, a state, a set bonus, a heal…): what it
// is, whose, its current application, and what it does (its effect and
// the in-game text of where it comes from).
export const BlockTipCard = ({
  chip,
  time,
  owner,
  holderName,
  healedName,
  accentClass,
}: {
  chip: BlockChip;
  time: number;
  owner: TipOwner | null;
  holderName?: string | null;
  healedName?: string | null;
  accentClass?: string;
}) => {
  const span = spanAt(chip, time);
  const end = timerEnd(span);
  const renewals = chip.renewals?.length ?? 0;
  const stacksUp = chip.stacks?.filter(
    (stack) => stack.start <= time + 1e-6 && time < stack.end
  ).length;
  const ticks = chip.ticks ?? [];
  // No effect text: a trigger's own steps, or a special system's state
  // (the Nightsoul's Blessing), from the data.
  const triggerSteps = chip.effect
    ? []
    : [
        ...describeTrigger(chip.characterId, chip.blockId),
        ...describeSystemStatus(chip.characterId, chip.blockId),
      ];
  return (
    <TipCard
      icon={
        chip.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={chip.iconUrl} alt='' width={28} height={28} />
        ) : null
      }
      title={chip.label}
      owner={owner}
      badge={chip.sourceTag}
      value={chip.value ?? chip.short}
      accentClass={accentClass}
    >
      {chip.end === null ? (
        <TipTime start={chip.start} />
      ) : (
        <TipTime start={span.start} end={end ?? chip.end} />
      )}
      {chip.meter ? (
        // Its timer is a resource: how much there is, and what it needs.
        <TipStat
          label={chip.meter.label}
          value={`${meterAt(chip.meter, time).text} · needs ${
            meterAt(chip.meter, time).bound
          }`}
          className='text-sky-300'
        />
      ) : (
        end !== null &&
        end > time && (
          <TipStat
            label='Time left'
            value={tipSeconds(end - time)}
            className='text-sky-300'
          />
        )
      )}
      {renewals > 1 && <TipStat label='Applied' value={`${renewals} times`} />}
      {chip.kind === 'stacks' && stacksUp !== undefined && (
        <TipStat
          label='Stacks'
          value={`${stacksUp}${chip.max ? ` / ${chip.max}` : ''}`}
        />
      )}
      {holderName && <TipStat label='Held by' value={holderName} />}
      {chip.type === 'heal' && (
        <>
          <TipStat label='Heals' value={healedName ?? 'Whole party'} />
          {ticks.length > 1 && (
            <TipStat
              label='Ticks'
              value={`${ticks.filter((tick) => tick <= time + 1e-6).length} / ${
                ticks.length
              }`}
            />
          )}
        </>
      )}
      {chip.hitText && <TipStat label='Hits' value={chip.hitText} />}
      {chip.parts && chip.parts.length > 0 && (
        <div className='flex flex-col gap-1'>
          {chip.parts.map((part) => (
            <TipStat key={part.label} label={part.label} value={part.value} />
          ))}
        </div>
      )}
      {chip.effect && chip.effect !== chip.sourceText ? (
        <TipText title='What it does'>{chip.effect}</TipText>
      ) : (
        // A trigger has no effect text: its own steps, from its data.
        triggerSteps.length > 0 && (
          <TipText title='What it does'>{triggerSteps.join('\n')}</TipText>
        )
      )}
      {chip.sourceText && (
        <TipText title={chip.sourceName}>{chip.sourceText}</TipText>
      )}
    </TipCard>
  );
};
