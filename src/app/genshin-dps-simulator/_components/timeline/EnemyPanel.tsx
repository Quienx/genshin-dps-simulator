import { memo, useState } from 'react';

import { cn } from '@/lib/utils';

import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { CollapsibleSection } from '@/components/ui/disclosure';
import { Meter } from '@/components/ui/meter';
import { Inset, Panel } from '@/components/ui/panel';
import { StatList, StatRow } from '@/components/ui/stat-row';

import PanelTitle from './PanelTitle';
import PanelToggle from './PanelToggle';
import { ELEMENT_TEXT } from './sourceStyles';
import { samePanelProps } from './timelineData';
import formatNumber from '../../_lib/formatNumber';
import { elementIconUrl, monsterIconUrl } from '../../_lib/genshinIcons';
import {
  auraAt,
  damageUntil,
  eventReactionsUntil,
  INSPECTOR_ENEMY,
  InspectorView,
  reactionsUntil,
} from '../../_lib/inspector';

// The aura's gauge, in its element's color.
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
  // A glyph on its own: no tile behind it.
  return src ? (
    <Avatar
      src={src}
      alt={element}
      size={size}
      shape='square'
      className='bg-transparent'
    />
  ) : null;
};

const short = (value: number) => formatNumber(Math.round(value * 10) / 10);

type EnemyPanelProps = {
  view: InspectorView;
  time: number;
  // The run is playing: it follows the playhead less often (see
  // samePanelProps).
  playing?: boolean;
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
  const eventReactions = eventReactionsUntil(view.auras, time);
  const reactions = [...byReaction, ...eventReactions].reduce(
    (sum, entry) => sum + entry.count,
    0
  );
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
      <Panel
        as='aside'
        data-testid='timeline-enemy'
        className='flex shrink-0 items-center justify-between px-3 py-2'
      >
        <PanelTitle section='enemy'>Enemy</PanelTitle>
        <PanelToggle label='enemy' collapsed onToggle={onToggle} />
      </Panel>
    );
  }

  return (
    <Panel
      as='aside'
      data-testid='timeline-enemy'
      className='flex max-h-full min-h-0 shrink-0 flex-col gap-2 overflow-y-auto px-3 py-2'
    >
      <div className='flex items-center justify-between'>
        <PanelTitle section='enemy'>Enemy</PanelTitle>
        <PanelToggle label='enemy' collapsed={false} onToggle={onToggle} />
      </div>

      <Inset>
        <div className='flex gap-2.5'>
          <Avatar
            src={monsterIconUrl(INSPECTOR_ENEMY.icon)}
            alt={INSPECTOR_ENEMY.name}
            size={48}
            ring
            className='rounded-lg'
          />
          <div className='min-w-0 flex-1'>
            <p className='truncate text-xs text-foreground'>
              {INSPECTOR_ENEMY.name}{' '}
              <span className='text-subtle'>Lv. {level}</span>
            </p>
            {defeated > 0 && (
              <p
                data-testid='timeline-enemy-defeated'
                className='mt-0.5 text-2xs font-medium text-rose-300'
              >
                Defeated ×{defeated}
              </p>
            )}
            {/* The aura: always the same room, so nothing moves. */}
            <div
              data-testid='timeline-enemy-aura'
              className='mt-1.5 flex h-6 items-center gap-2 text-xs'
            >
              <span className='flex size-6 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-white/10'>
                {auraIcon && (
                  <Avatar
                    src={auraIcon}
                    size={16}
                    shape='square'
                    className='bg-transparent'
                  />
                )}
              </span>
              {aura ? (
                <>
                  <span
                    className={cn(
                      'font-medium',
                      ELEMENT_TEXT[aura.element] ?? 'text-muted-foreground'
                    )}
                  >
                    {aura.element}
                  </span>
                  <span className='ml-auto text-muted-foreground tabular-nums'>
                    {short(aura.gauge)} U
                  </span>
                </>
              ) : (
                <span className='text-subtle'>No aura</span>
              )}
            </div>
            {/* How long the aura has left. */}
            <Meter
              aria-label='Aura left'
              value={
                aura && Number.isFinite(aura.goneIn) && aura.total > 0
                  ? aura.goneIn / aura.total
                  : 0
              }
              className='mt-1 bg-muted'
              indicatorClassName={
                aura ? ELEMENT_BARS[aura.element] ?? 'bg-slate-400' : undefined
              }
            />
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
              : 'bg-muted/40'
          )}
        >
          {recent ? (
            <>
              <AvatarStack overlap='sm'>
                <ElementIcon element={recent.element} size={16} />
                <ElementIcon element={recent.hitElement} size={16} />
              </AvatarStack>
              <span className='font-semibold text-violet-200'>
                {recent.reaction}
              </span>
              <span className='text-2xs text-subtle tabular-nums'>
                {short(recent.time)} s
              </span>
              {recentHit && (
                <span className='ml-auto font-semibold text-amber-300 tabular-nums'>
                  {formatNumber(Math.round(recentHit.damage))}
                </span>
              )}
            </>
          ) : (
            <span className='text-2xs text-subtle'>No reaction now</span>
          )}
        </div>

        <Meter
          aria-label='HP'
          value={share}
          size='sm'
          className='mt-2.5 bg-rose-950/80'
          indicatorClassName='bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_8px_var(--color-rose-500)]'
        />
        <div className='mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums'>
          <span>
            HP {formatNumber(Math.round(left))} / {formatNumber(hp)}
          </span>
          <span>{formatNumber(Math.round(share * 1000) / 10)}%</span>
        </div>
      </Inset>

      <Inset className='p-0'>
        <CollapsibleSection
          title='Simulation Stats'
          // Its state is the panel's, so it outlives minimizing the panel.
          open={statsOpen}
          onOpenChange={setStatsOpen}
          triggerClassName='gap-2 px-2.5 py-2 text-xs font-medium text-foreground'
          chevronClassName='size-4'
        >
          <StatList className='px-2.5 pb-2.5'>
            {[
              ['Total Damage', formatNumber(Math.round(taken))],
              ['Defeated', formatNumber(defeated)],
              ['DPS', formatNumber(Math.round(time > 0 ? taken / time : 0))],
              ['Reactions', formatNumber(reactions)],
              ['Time', `${time.toFixed(1)} s`],
            ].map(([label, value]) => (
              <StatRow key={label} label={label} value={value} />
            ))}
            {/* Each reaction so far: how many and their DMG. */}
            {byReaction.map((entry) => (
              <StatRow
                key={entry.reaction}
                data-testid={`timeline-enemy-reaction-${entry.reaction}`}
                size='2xs'
                className='items-center pl-3'
                // The same two elements as the reaction above.
                icon={
                  <AvatarStack overlap='sm'>
                    {elementsOf(entry.reaction).map((element) => (
                      <ElementIcon key={element} element={element} size={16} />
                    ))}
                  </AvatarStack>
                }
                label={`${entry.reaction} ×${entry.count}`}
                labelClassName='text-violet-300'
                value={formatNumber(Math.round(entry.damage))}
                valueClassName='font-normal text-muted-foreground'
              />
            ))}
            {/* Reactions with no hit of their own (Lunar-Bloom). */}
            {eventReactions.map((entry) => (
              <StatRow
                key={entry.reaction}
                data-testid={`timeline-enemy-reaction-${entry.reaction}`}
                size='2xs'
                className='items-center pl-3'
                icon={
                  <AvatarStack overlap='sm'>
                    {elementsOf(entry.reaction).map((element) => (
                      <ElementIcon key={element} element={element} size={16} />
                    ))}
                  </AvatarStack>
                }
                label={`${entry.reaction} ×${entry.count}`}
                labelClassName='text-violet-300'
                value='no DMG'
                valueClassName='font-normal text-subtle'
              />
            ))}
          </StatList>
        </CollapsibleSection>
      </Inset>
    </Panel>
  );
};

// It follows the playhead at most every PANEL_QUANTUM.
export default memo(EnemyPanel, samePanelProps);
