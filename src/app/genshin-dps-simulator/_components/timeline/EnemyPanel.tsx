import { ChevronDown } from 'lucide-react';
import { memo, useState } from 'react';

import { cn } from '@/lib/utils';

import PanelToggle from './PanelToggle';
import SectionHelp from './SectionHelp';
import { samePanelProps } from './timelineData';
import formatNumber from '../../_lib/formatNumber';
import { elementIconUrl, monsterIconUrl } from '../../_lib/genshinIcons';
import {
  auraAt,
  damageUntil,
  INSPECTOR_ENEMY,
  InspectorView,
  reactionsUntil,
} from '../../_lib/inspector';

// The aura's element, in its color.
const ELEMENT_TEXT: Record<string, string> = {
  Pyro: 'text-orange-400',
  Electro: 'text-violet-400',
  Hydro: 'text-sky-400',
  Cryo: 'text-cyan-300',
  Dendro: 'text-lime-400',
};
const ELEMENT_BARS: Record<string, string> = {
  Pyro: 'bg-orange-500',
  Electro: 'bg-violet-500',
  Hydro: 'bg-sky-500',
  Cryo: 'bg-cyan-400',
  Dendro: 'bg-lime-500',
};

// How long a reaction stays shown after it happens.
const REACTION_SHOWN_SECONDS = 1.5;

const ElementIcon = ({ element, size }: { element: string; size: number }) => {
  const src = elementIconUrl(element);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={element} width={size} height={size} />
  ) : null;
};

const short = (value: number) => formatNumber(Math.round(value * 10) / 10);

type EnemyPanelProps = {
  view: InspectorView;
  time: number;
  hp: number;
  level: number;
  collapsed: boolean;
  onToggle: () => void;
};

// The enemy at the playhead: its aura and HP, and the run's stats so far.
const EnemyPanel = ({
  view,
  time,
  hp,
  level,
  collapsed,
  onToggle,
}: EnemyPanelProps) => {
  const [statsOpen, setStatsOpen] = useState(true);
  const taken = damageUntil(view.hits, time);
  // Each time its HP reaches 0 the enemy comes back at full HP, and the
  // DMG past 0 (the overkill) carries over to the new bar.
  const defeated = hp > 0 ? Math.floor(taken / hp) : 0;
  const left = hp > 0 ? hp - (taken - defeated * hp) : 0;
  const share = hp > 0 ? left / hp : 0;
  const aura = auraAt(view.auras, time);
  const byReaction = reactionsUntil(view.hits, time);
  const reactions = byReaction.reduce((sum, entry) => sum + entry.count, 0);
  // The reaction the enemy just took: the aura's two elements that met,
  // and its own hit's DMG (Overloaded's explosion).
  const recent = [...view.auras]
    .reverse()
    .find(
      (point) =>
        point.reaction &&
        point.time <= time + 1e-6 &&
        time - point.time < REACTION_SHOWN_SECONDS
    );
  // The two elements that met in a reaction (its latest one so far).
  const elementsOf = (reaction: string) => {
    const point = [...view.auras]
      .reverse()
      .find(
        (entry) => entry.reaction === reaction && entry.time <= time + 1e-6
      );
    return point ? [point.element, point.hitElement] : [];
  };
  const recentHit = recent
    ? view.hits.find(
        (hit) =>
          hit.reaction === recent.reaction &&
          hit.category === hit.reaction &&
          Math.abs(hit.time - recent.time) < 1e-6
      )
    : undefined;
  const auraIcon = aura ? elementIconUrl(aura.element) : null;

  // Minimized: its title bar only.
  if (collapsed) {
    return (
      <aside
        data-testid='timeline-enemy'
        className='flex shrink-0 items-center justify-between rounded-xl border border-slate-700/60 bg-slate-900/70 px-2.5 py-2'
      >
        <h2 className='flex items-center gap-1.5 text-sm font-semibold text-slate-50'>
          Enemy
          <SectionHelp section='enemy' />
        </h2>
        <PanelToggle label='enemy' collapsed onToggle={onToggle} />
      </aside>
    );
  }

  return (
    <aside
      data-testid='timeline-enemy'
      className='flex max-h-full min-h-0 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-900/70 p-2.5'
    >
      <div className='flex items-center justify-between'>
        <h2 className='flex items-center gap-1.5 text-sm font-semibold text-slate-50'>
          Enemy
          <SectionHelp section='enemy' />
        </h2>
        <PanelToggle label='enemy' collapsed={false} onToggle={onToggle} />
      </div>

      <section className='rounded-lg border border-slate-700/60 bg-slate-950/50 p-2.5'>
        <div className='flex gap-2.5'>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={monsterIconUrl(INSPECTOR_ENEMY.icon)}
            alt={INSPECTOR_ENEMY.name}
            width={48}
            height={48}
            className='size-12 shrink-0 rounded-lg bg-slate-800 ring-1 ring-white/10'
          />
          <div className='min-w-0 flex-1'>
            <p className='truncate text-xs text-slate-100'>
              {INSPECTOR_ENEMY.name}{' '}
              <span className='text-slate-400'>Lv. {level}</span>
            </p>
            {defeated > 0 && (
              <p
                data-testid='timeline-enemy-defeated'
                className='mt-0.5 text-[10px] font-medium text-rose-300'
              >
                Defeated ×{defeated}
              </p>
            )}
            {/* The aura: always the same room, so nothing moves. */}
            <div
              data-testid='timeline-enemy-aura'
              className='mt-1.5 flex h-6 items-center gap-2 text-xs'
            >
              <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-800 ring-1 ring-white/10'>
                {auraIcon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={auraIcon} alt='' width={16} height={16} />
                )}
              </span>
              {aura ? (
                <>
                  <span
                    className={cn(
                      'font-medium',
                      ELEMENT_TEXT[aura.element] ?? 'text-slate-200'
                    )}
                  >
                    {aura.element}
                  </span>
                  <span className='ml-auto text-slate-300 tabular-nums'>
                    {short(aura.gauge)} U
                  </span>
                </>
              ) : (
                <span className='text-slate-500'>No aura</span>
              )}
            </div>
            {/* How long the aura has left. */}
            <div className='mt-1 h-1 overflow-hidden rounded-full bg-slate-800'>
              {aura && Number.isFinite(aura.goneIn) && aura.total > 0 && (
                <div
                  className={cn(
                    'h-full',
                    ELEMENT_BARS[aura.element] ?? 'bg-slate-400'
                  )}
                  style={{ width: `${(aura.goneIn / aura.total) * 100}%` }}
                />
              )}
            </div>
          </div>
        </div>

        {/* The reaction just taken: always the same room, so the HP bar
            never moves. */}
        <div
          data-testid='timeline-enemy-reaction'
          className={cn(
            'mt-2.5 flex h-8 items-center gap-2 rounded-md px-2 text-xs transition-colors',
            recent
              ? 'animate-in bg-violet-500/15 ring-1 ring-violet-400/40 fade-in'
              : 'bg-slate-800/40'
          )}
        >
          {recent ? (
            <>
              <span className='flex items-center -space-x-1'>
                <ElementIcon element={recent.element} size={16} />
                <ElementIcon element={recent.hitElement} size={16} />
              </span>
              <span className='font-semibold text-violet-200'>
                {recent.reaction}
              </span>
              <span className='text-[11px] text-slate-400 tabular-nums'>
                {short(recent.time)} s
              </span>
              {recentHit && (
                <span className='ml-auto font-semibold text-amber-300 tabular-nums'>
                  {formatNumber(Math.round(recentHit.damage))}
                </span>
              )}
            </>
          ) : (
            <span className='text-[11px] text-slate-500'>No reaction now</span>
          )}
        </div>

        <div className='mt-2.5 h-1.5 overflow-hidden rounded-full bg-rose-950/80'>
          <div
            className='h-full rounded-full bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_8px_var(--color-rose-500)]'
            style={{ width: `${share * 100}%` }}
          />
        </div>
        <div className='mt-1.5 flex justify-between text-xs text-slate-200 tabular-nums'>
          <span>
            HP {formatNumber(Math.round(left))} / {formatNumber(hp)}
          </span>
          <span>{formatNumber(Math.round(share * 1000) / 10)}%</span>
        </div>
      </section>

      <section className='rounded-lg border border-slate-700/60 bg-slate-950/50'>
        <button
          type='button'
          aria-expanded={statsOpen}
          onClick={() => setStatsOpen((value) => !value)}
          className='flex w-full items-center gap-2 px-2.5 py-2 text-xs font-medium text-slate-100'
        >
          <ChevronDown
            className={cn(
              'size-4 text-slate-400 transition-transform',
              !statsOpen && '-rotate-90'
            )}
          />
          Simulation Stats
        </button>
        {statsOpen && (
          <dl className='flex flex-col gap-1.5 px-2.5 pb-2.5 text-xs tabular-nums'>
            {[
              ['Total Damage', formatNumber(Math.round(taken))],
              ['Defeated', formatNumber(defeated)],
              ['DPS', formatNumber(Math.round(time > 0 ? taken / time : 0))],
              ['Reactions', formatNumber(reactions)],
              ['Time', `${time.toFixed(1)} s`],
            ].map(([label, value]) => (
              <div key={label} className='flex justify-between'>
                <dt className='text-slate-400'>{label}</dt>
                <dd className='text-slate-100'>{value}</dd>
              </div>
            ))}
            {/* Each reaction so far: how many and their DMG. */}
            {byReaction.map((entry) => (
              <div
                key={entry.reaction}
                data-testid={`timeline-enemy-reaction-${entry.reaction}`}
                className='flex items-center justify-between pl-3 text-[11px]'
              >
                <dt className='flex items-center gap-1.5 text-violet-300'>
                  {/* The same two elements as the reaction above. */}
                  <span className='flex items-center -space-x-1'>
                    {elementsOf(entry.reaction).map((element) => (
                      <ElementIcon key={element} element={element} size={16} />
                    ))}
                  </span>
                  {entry.reaction} ×{entry.count}
                </dt>
                <dd className='text-slate-200'>
                  {formatNumber(Math.round(entry.damage))}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </aside>
  );
};

// It follows the playhead at most every PANEL_QUANTUM.
export default memo(EnemyPanel, samePanelProps);
