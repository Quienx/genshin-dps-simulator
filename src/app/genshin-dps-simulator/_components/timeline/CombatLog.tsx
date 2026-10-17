import {
  CircleDot,
  Crosshair,
  HeartPulse,
  LucideIcon,
  Pencil,
  Search,
  ShieldMinus,
  ShieldPlus,
  Sparkle,
  Swords,
} from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import PanelToggle from './PanelToggle';
import { TimelineMember } from './TimelineChart';
import {
  actionTitle,
  countUpTo,
  displayAction,
  eventTimes,
  hitsOfAction,
  isReactionHit,
} from './timelineData';
import RotationActionIcon from '../rotation/RotationActionIcon';
import formatNumber from '../../_lib/formatNumber';
import { elementIconUrl } from '../../_lib/genshinIcons';
import { EnemyHit, InspectorView } from '../../_lib/inspector';
import { RotationAction } from '../../_lib/rotation/rotationSchema';

// What a row is, for the filters.
type Category = 'damage' | 'healing' | 'buffs' | 'debuffs' | 'other';

// The filters: All, then one per category.
const TABS: {
  id: 'all' | Category;
  label: string;
  Icon: LucideIcon;
  color: string;
}[] = [
  { id: 'all', label: 'All', Icon: Pencil, color: 'text-sky-300' },
  { id: 'damage', label: 'Damage', Icon: Swords, color: 'text-amber-400' },
  {
    id: 'healing',
    label: 'Healing',
    Icon: HeartPulse,
    color: 'text-emerald-400',
  },
  { id: 'buffs', label: 'Buffs', Icon: ShieldPlus, color: 'text-sky-400' },
  {
    id: 'debuffs',
    label: 'Debuffs',
    Icon: ShieldMinus,
    color: 'text-rose-400',
  },
  { id: 'other', label: 'Other', Icon: CircleDot, color: 'text-slate-300' },
];

const ELEMENT_TEXT: Record<string, string> = {
  Pyro: 'text-orange-400',
  Electro: 'text-violet-400',
  Hydro: 'text-sky-400',
  Cryo: 'text-cyan-300',
  Dendro: 'text-lime-400',
  Anemo: 'text-teal-300',
  Geo: 'text-yellow-400',
  Physical: 'text-slate-300',
};

const COLUMNS =
  'grid grid-cols-[72px_130px_minmax(150px,1.5fr)_minmax(90px,1fr)_100px_minmax(150px,1.2fr)] items-center gap-2.5';

const ElementIcon = ({ element, size }: { element: string; size: number }) => {
  const src = elementIconUrl(element);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={element} width={size} height={size} />
  ) : null;
};

const Tag = ({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) => <span className={cn('whitespace-nowrap', className)}>({children})</span>;

type LogRow = {
  key: string;
  category: Category;
  // The row's words, for the search.
  search: string;
  time: number;
  characterId: string;
  icon: ReactNode;
  ability: string;
  details: string;
  amount: string;
  amountClass: string;
  notes: ReactNode;
};

type CombatLogProps = {
  view: InspectorView;
  members: TimelineMember[];
  actionsById: Map<string, RotationAction>;
  time: number;
  onSeek: (time: number) => void;
  collapsed: boolean;
  onToggle: () => void;
};

// What happened up to the playhead, newest on top: each action with its
// hits so far, each reaction and each heal. A click moves the playhead
// there.
const CombatLog = ({
  view,
  members,
  actionsById,
  time,
  onSeek,
  collapsed,
  onToggle,
}: CombatLogProps) => {
  const [tab, setTab] = useState<'all' | Category>('all');
  const [query, setQuery] = useState('');
  const memberOf = useMemo(
    () => new Map(members.map((member) => [member.characterId, member])),
    [members]
  );
  // Each action's hits, once per run.
  const actionHits = useMemo(
    () =>
      new Map(
        view.actions.map((action) => [action.key, hitsOfAction(view, action)])
      ),
    [view]
  );

  // Every row up to `now` (Infinity: the whole run, for Jump to event).
  const buildRows = (now: number): LogRow[] => {
    const nameOf = (id: string) => memberOf.get(id)?.name ?? id;
    const actionRows: LogRow[] = view.actions
      .filter((action) => action.start <= now)
      .map((action) => {
        const rotationAction = displayAction(action, actionsById);
        const all = actionHits.get(action.key) ?? [];
        const hits = all.filter((hit) => hit.time <= now);
        const pending = all.length - hits.length;
        const damage = hits.reduce((sum, hit) => sum + hit.damage, 0);
        const crits = hits.filter((hit) => hit.isCrit).length;
        const elements = Array.from(new Set(hits.map((hit) => hit.element)));
        const amplified = Array.from(
          new Set(
            hits
              .filter((hit) => hit.reaction !== 'None')
              .map((hit) => hit.reaction)
          )
        );
        const rounded = hits.map((hit) => Math.round(hit.damage));
        const same =
          rounded.length > 0 && rounded.every((d) => d === rounded[0]);
        const ability = actionTitle(action, rotationAction);
        return {
          key: action.key,
          // An action that deals no DMG (a dodge, a wait) is Other.
          category: all.length > 0 ? ('damage' as const) : ('other' as const),
          search: [
            nameOf(action.characterId),
            ability,
            ...elements,
            ...amplified,
            crits > 0 ? 'crit' : '',
          ].join(' '),
          time: action.start,
          characterId: action.characterId,
          icon: rotationAction ? (
            <RotationActionIcon
              action={rotationAction}
              size={18}
              className='bg-transparent p-0 ring-0'
            />
          ) : (
            <Sparkle className='size-5 text-slate-400' />
          ),
          ability,
          details:
            hits.length === 0 && pending === 0
              ? 'No hits'
              : `${hits.length} hit${hits.length === 1 ? '' : 's'}${
                  pending > 0 ? ` · ${pending} to land` : ''
                }`,
          amount: hits.length > 0 ? formatNumber(Math.round(damage)) : '—',
          amountClass:
            crits > 0
              ? 'text-rose-400'
              : rotationAction?.kind === 'burst'
              ? 'text-violet-300'
              : 'text-slate-100',
          notes:
            hits.length > 0 ? (
              <>
                <span className='text-slate-300'>
                  {same
                    ? `${formatNumber(rounded[0])}${
                        hits.length > 1 ? ` ×${hits.length}` : ''
                      }`
                    : `max ${formatNumber(Math.max(...rounded))}`}
                </span>
                {crits > 0 && (
                  <Tag className='text-rose-400'>
                    ✦ Crit{crits > 1 ? ` ×${crits}` : ''}
                  </Tag>
                )}
                {elements.map((element) => (
                  <Tag
                    key={element}
                    className={ELEMENT_TEXT[element] ?? 'text-slate-300'}
                  >
                    {element}
                  </Tag>
                ))}
                {amplified.map((reaction) => (
                  <Tag key={reaction} className='text-violet-300'>
                    {reaction}
                  </Tag>
                ))}
              </>
            ) : null,
        };
      });

    // A reaction's own hit, with the two elements that met (as in the enemy
    // panel).
    const elementsOf = (hit: EnemyHit) => {
      const point = view.auras.find(
        (entry) =>
          entry.reaction === hit.reaction &&
          Math.abs(entry.time - hit.time) < 1e-6
      );
      return point ? [point.element, point.hitElement] : [hit.element];
    };
    const reactionRows: LogRow[] = view.hits
      .filter((hit) => isReactionHit(hit) && hit.time <= now)
      .map((hit) => {
        const elements = elementsOf(hit);
        return {
          key: `reaction-${hit.characterId}-${hit.index}`,
          category: 'damage' as const,
          search: [
            nameOf(hit.characterId),
            hit.reaction,
            ...elements,
            'reaction',
          ].join(' '),
          time: hit.time,
          characterId: hit.characterId,
          icon: (
            <span className='flex items-center -space-x-1'>
              {elements.map((element) => (
                <ElementIcon key={element} element={element} size={18} />
              ))}
            </span>
          ),
          ability: hit.reaction,
          details: elements.join(' + '),
          amount: formatNumber(Math.round(hit.damage)),
          amountClass: 'text-amber-300',
          notes: (
            <>
              <span className='text-slate-300'>
                {formatNumber(Math.round(hit.damage))}
              </span>
              <Tag className='text-violet-300'>{hit.reaction}</Tag>
            </>
          ),
        };
      });

    const healRows: LogRow[] = view.chips
      .filter((chip) => chip.kind === 'heal' && !chip.hidden)
      .flatMap((chip) =>
        (chip.ticks ?? [chip.start])
          .filter((tick) => tick <= now)
          .map((tick, index) => ({
            key: `${chip.key}-${index}`,
            category: 'healing' as const,
            search: [
              nameOf(chip.characterId),
              chip.label,
              chip.healed ? nameOf(chip.healed) : 'party',
              'heal',
            ].join(' '),
            time: tick,
            characterId: chip.characterId,
            icon: chip.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={chip.iconUrl} alt='' width={18} height={18} />
            ) : (
              <HeartPulse className='size-5 text-emerald-400' />
            ),
            ability: chip.label,
            details: `1 tick${
              (chip.ticks?.length ?? 0) > 1
                ? ` (${index + 1}/${chip.ticks?.length})`
                : ''
            }`,
            amount: chip.short ?? '—',
            amountClass: 'text-emerald-300',
            notes: (
              <>
                <span className='text-slate-300'>
                  {chip.healed
                    ? memberOf.get(chip.healed)?.name ?? chip.healed
                    : 'Party'}
                </span>
                <Tag className='text-emerald-400'>Heal</Tag>
              </>
            ),
          }))
      );

    // Each block applied (a buff, a debuff, a state, particles…): one row
    // each time it is applied.
    const blockRows: LogRow[] = view.chips
      .filter((chip) => !chip.hidden && chip.kind !== 'heal')
      .flatMap((chip) => {
        const category: Category =
          chip.type === 'bonus'
            ? 'buffs'
            : chip.type === 'debuff'
            ? 'debuffs'
            : 'other';
        const applications =
          chip.renewals && chip.renewals.length > 0
            ? chip.renewals.map((renewal) => ({
                start: renewal.start,
                end: renewal.until ?? renewal.end,
              }))
            : [{ start: chip.start, end: chip.end }];
        return applications
          .filter((entry) => entry.start <= now)
          .map((entry, index) => ({
            key: `${chip.key}@${index}`,
            category,
            search: [
              nameOf(chip.characterId),
              chip.label,
              chip.sourceTag,
              chip.sourceName ?? '',
              chip.value ?? '',
              category,
            ].join(' '),
            time: entry.start,
            characterId: chip.characterId,
            icon: chip.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={chip.iconUrl} alt='' width={18} height={18} />
            ) : (
              <Sparkle className='size-4 text-slate-400' />
            ),
            ability: chip.label,
            details:
              chip.kind === 'particles'
                ? 'Particles'
                : chip.kind === 'stacks'
                ? 'Stack gained'
                : entry.end === null
                ? 'Triggered'
                : `${index > 0 ? 'Renewed' : 'Applied'} · ${formatNumber(
                    Math.round((entry.end - entry.start) * 10) / 10
                  )} s`,
            amount: chip.value ?? chip.short ?? '—',
            amountClass:
              category === 'buffs'
                ? 'text-emerald-300'
                : category === 'debuffs'
                ? 'text-rose-300'
                : 'text-slate-300',
            notes: (
              <>
                <Tag className='text-slate-400'>{chip.sourceTag}</Tag>
                {category !== 'other' && (
                  <Tag
                    className={
                      category === 'buffs'
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }
                  >
                    {category === 'buffs' ? 'Buff' : 'Debuff'}
                  </Tag>
                )}
              </>
            ),
          }));
      });

    // Newest on top (an action before a reaction or heal of the same moment
    // ends up below them).
    return [...actionRows, ...reactionRows, ...healRows, ...blockRows].sort(
      (a, b) => b.time - a.time
    );
  };

  // The filters: the tab's category and the search's words.
  const words = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query]
  );
  const matches = (row: LogRow, category: 'all' | Category) =>
    (category === 'all' || row.category === category) &&
    words.every((word) => row.search.toLowerCase().includes(word));
  // The rows only change when the playhead crosses an event (a hit, an
  // action, a block), so they are rebuilt then, not on every frame.
  const times = useMemo(() => eventTimes(view), [view]);
  const step = countUpTo(times, time + 1e-6);
  const allRows = useMemo(
    () => buildRows(time + 1e-6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, view, actionsById, memberOf]
  );
  const rows = useMemo(
    () => allRows.filter((row) => matches(row, tab)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, tab, words]
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        TABS.map(({ id }) => [
          id,
          allRows.filter((row) => matches(row, id)).length,
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, words]
  );
  // The whole run's rows, for Jump to event (they do not change with the
  // playhead).
  const runRows = useMemo(
    () => buildRows(Number.POSITIVE_INFINITY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, actionsById, memberOf]
  );
  // The rows drawn: redrawn only when the rows change.
  const rowItems = useMemo(
    () =>
      rows.map((row, index) => {
        const member = memberOf.get(row.characterId);
        return (
          <li key={row.key}>
            <button
              type='button'
              onClick={() => onSeek(row.time)}
              className={cn(
                COLUMNS,
                'w-full border-b border-slate-800/80 px-3 py-1 text-left text-xs hover:bg-slate-800/50',
                index === 0 && 'bg-sky-500/5'
              )}
            >
              <span className='flex items-center gap-2 font-mono text-[11px] text-slate-200 tabular-nums'>
                <span
                  className={cn(
                    'h-3.5 w-1 rounded-full',
                    member?.color.bar ?? 'bg-slate-400'
                  )}
                />
                {row.time.toFixed(3)}s
              </span>
              <span className='flex min-w-0 items-center gap-2 text-slate-200'>
                {member && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={member.avatar}
                    alt=''
                    width={20}
                    height={20}
                    className='size-5 rounded-md bg-slate-700'
                  />
                )}
                <span className='truncate'>
                  {member?.name ?? row.characterId}
                </span>
              </span>
              <span className='flex min-w-0 items-center gap-2 text-slate-200'>
                <span className='flex size-5 shrink-0 items-center justify-center'>
                  {row.icon}
                </span>
                <span className='truncate'>{row.ability}</span>
              </span>
              <span className='truncate text-[11px] text-slate-400'>
                {row.details}
              </span>
              <span
                className={cn(
                  'text-right font-semibold tabular-nums',
                  row.amountClass
                )}
              >
                {row.amount}
              </span>
              <span className='flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] tabular-nums'>
                {row.notes}
              </span>
            </button>
          </li>
        );
      }),
    [rows, memberOf, onSeek]
  );

  // The next event after the playhead that the filters keep (else the
  // first one).
  const jumpToEvent = () => {
    const kept = runRows
      .filter((row) => matches(row, tab))
      .sort((a, b) => a.time - b.time);
    const next = kept.find((row) => row.time > time + 1e-3) ?? kept[0];
    if (next) {
      onSeek(next.time);
    }
  };

  return (
    <section
      data-testid='timeline-combat-log'
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900/70',
        !collapsed && 'h-full'
      )}
    >
      <div
        className={cn(
          'flex shrink-0 flex-wrap items-center gap-2 px-3 py-2',
          !collapsed && 'border-b border-slate-700/60'
        )}
      >
        <h2 className='mr-2 text-sm font-semibold text-slate-50'>Combat Log</h2>
        <div role='tablist' className='flex flex-wrap gap-1'>
          {TABS.map(({ id, label, Icon, color }) => (
            <button
              key={id}
              type='button'
              role='tab'
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-slate-800',
                tab === id && 'bg-sky-600/30 text-sky-50 ring-1 ring-sky-500/40'
              )}
            >
              <Icon className={cn('size-3.5', color)} aria-hidden />
              {label}
              <span className='text-[10px] text-slate-500 tabular-nums'>
                {counts[id]}
              </span>
            </button>
          ))}
        </div>
        <div className='ml-auto flex items-center gap-2'>
          <button
            type='button'
            data-testid='timeline-log-jump'
            title='Move the playhead to the next event the filters keep'
            onClick={jumpToEvent}
            className='flex h-7 items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/60 px-3 text-[11px] text-slate-300 hover:bg-slate-700/70'
          >
            <Crosshair className='size-3.5' aria-hidden />
            Jump to event
          </button>
          <label className='flex h-7 w-48 items-center gap-2 rounded-md border border-slate-700/60 bg-slate-950/60 px-2.5 text-[11px] text-slate-400'>
            <Search className='size-3.5' aria-hidden />
            <input
              type='search'
              data-testid='timeline-log-search'
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='Search events...'
              className='w-full border-0 bg-transparent p-0 text-[11px] text-slate-100 placeholder:text-slate-500 focus:ring-0'
            />
          </label>
          <PanelToggle
            label='combat log'
            collapsed={collapsed}
            onToggle={onToggle}
          />
        </div>
      </div>

      {!collapsed && (
        <>
          {/* The rows fill the rest and scroll; the column names stay. */}
          <div className='min-h-0 flex-1 overflow-x-auto'>
            <div className='flex h-full min-w-[900px] flex-col'>
              <div
                className={cn(
                  COLUMNS,
                  'shrink-0 border-b border-slate-700/60 px-3 py-1.5 text-[10px] text-slate-400'
                )}
              >
                <span>Time</span>
                <span>Character</span>
                <span>Ability</span>
                <span>Details</span>
                <span className='text-right'>Damage / Amount</span>
                <span>Notes</span>
              </div>
              <ul
                data-testid='timeline-log-rows'
                className='min-h-0 flex-1 overflow-y-auto'
              >
                {rows.length === 0 && (
                  <li className='px-3 py-6 text-center text-xs text-slate-500'>
                    {allRows.length === 0
                      ? 'Nothing happened yet: play or move the playhead.'
                      : 'No events match the filters yet.'}
                  </li>
                )}
                {rowItems}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
};

export default CombatLog;
