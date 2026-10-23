import { ChevronDown } from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Meter } from '@/components/ui/meter';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { StatList, StatRow } from '@/components/ui/stat-row';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import PanelTitle from './PanelTitle';
import { damageTypeBar } from './sourceStyles';
import { TimelineMember } from './TimelineChart';
import {
  countUpTo,
  damageBreakdown,
  DamageShare,
  samePanelProps,
} from './timelineData';
import formatNumber from '../../_lib/formatNumber';
import { InspectorView } from '../../_lib/inspector';

type ResultsPanelProps = {
  view: InspectorView;
  members: TimelineMember[];
  time: number;
  playing?: boolean;
  // The run's total against the last run of the same scenario and CRIT
  // mode (+0.021: 2.1% more), or null when there is none to compare.
  change: number | null;
};

const percent = (share: number) =>
  `${formatNumber(Math.round(share * 1000) / 10)}%`;

// Less than this is the same total (a rebuilt rotation, the same blocks).
const SAME_RUN = 0.0005;

// Each member's share of the run's DMG, in the party's order (so each
// color stays in its place).
const ShareBar = ({
  shares,
  colorOf,
  className,
}: {
  shares: DamageShare[];
  colorOf: (characterId: string) => string;
  className?: string;
}) => (
  <span
    aria-hidden
    className={cn(
      'flex h-2 overflow-hidden rounded-full bg-accent/70',
      className
    )}
  >
    {shares.map((entry) => (
      <span
        key={entry.key}
        className={cn('h-full', colorOf(entry.key))}
        style={{ width: `${entry.share * 100}%` }}
      />
    ))}
  </span>
);

// The run's result, in the top bar: its DPS and DMG over the counted
// duration (60 s) and the change against the last run; `Breakdown` opens
// who and what dealt it, and how far the playhead is into it.
const ResultsPanel = ({ view, members, time, change }: ResultsPanelProps) => {
  const [by, setBy] = useState<'members' | 'types'>('members');
  // Every hit's time and the total up to it, and the breakdown (once per
  // run): each frame only looks the total up.
  const damage = useMemo(() => {
    const hits = view.hits
      .filter((hit) => hit.counted)
      .sort((a, b) => a.time - b.time);
    const times: number[] = [];
    const totals: number[] = [];
    let total = 0;
    hits.forEach((hit) => {
      total += hit.damage;
      times.push(hit.time);
      totals.push(total);
    });
    return { times, totals, ...damageBreakdown(view) };
  }, [view]);
  const memberOf = new Map(
    members.map((member) => [member.characterId, member])
  );
  const colorOf = (characterId: string) =>
    memberOf.get(characterId)?.color.bar ?? 'bg-slate-500';
  const landed = countUpTo(damage.times, time + 1e-6);
  const dealt = landed > 0 ? damage.totals[landed - 1] : 0;
  const dps = damage.total / view.countedDuration;
  const partyShares = members
    .map((member) =>
      damage.byMember.find((entry) => entry.key === member.characterId)
    )
    .filter((entry): entry is DamageShare => entry !== undefined);
  const rows = by === 'members' ? damage.byMember : damage.byType;
  const totalText = `${formatNumber(
    Math.round(damage.total)
  )} DMG in ${formatNumber(view.countedDuration)} s`;

  return (
    <div data-testid='timeline-results' className='flex items-center gap-2'>
      <p
        data-testid='timeline-results-dps'
        title={`${totalText}, ${
          view.critMode === 'random' ? 'CRITs rolled' : 'average CRITs'
        }`}
        className='flex items-baseline gap-1 whitespace-nowrap tabular-nums'
      >
        <span className='text-base leading-none font-semibold text-amber-300'>
          {formatNumber(Math.round(dps))}
        </span>
        <span className='text-2xs font-medium text-subtle'>DPS</span>
      </p>
      <span className='hidden text-2xs whitespace-nowrap text-subtle tabular-nums xl:inline'>
        {totalText}
      </span>
      {change !== null && view.critMode === 'expected' && (
        <Badge
          size='sm'
          variant='outline'
          data-testid='timeline-results-change'
          title='Against the last run of this team with average CRIT'
          className={cn(
            'whitespace-nowrap',
            change >= SAME_RUN
              ? 'border-emerald-500/40 text-emerald-300'
              : change <= -SAME_RUN
              ? 'border-rose-500/40 text-rose-300'
              : 'text-subtle'
          )}
        >
          {Math.abs(change) < SAME_RUN
            ? 'Same as before'
            : `${change > 0 ? '+' : '−'}${percent(Math.abs(change))} vs before`}
        </Badge>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant='secondary'
            size='xs'
            data-testid='timeline-results-breakdown-toggle'
            className='gap-1.5'
          >
            {members.length > 1 && (
              <ShareBar
                shares={partyShares}
                colorOf={colorOf}
                className='w-12'
              />
            )}
            Breakdown
            <ChevronDown className='size-3' aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align='end'
          data-testid='timeline-results-panel'
          className='flex w-80 flex-col gap-2 p-3'
          // The focus stays on Breakdown: on the title's "?" it would open
          // the help over the numbers.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className='flex items-baseline justify-between gap-2'>
            <PanelTitle section='damage'>Results</PanelTitle>
            <span className='text-2xs text-subtle tabular-nums'>
              {totalText}
            </span>
          </div>

          {/* Each member's share, in the party's order. */}
          {members.length > 1 && (
            <div className='flex flex-col gap-1'>
              <ShareBar shares={partyShares} colorOf={colorOf} />
              <ul className='flex flex-wrap gap-x-2.5 gap-y-0.5 text-2xs text-subtle'>
                {partyShares.map((entry) => (
                  <li key={entry.key} className='flex items-center gap-1'>
                    <span
                      className={cn('size-2 rounded-full', colorOf(entry.key))}
                    />
                    {entry.label}
                    <span className='text-muted-foreground tabular-nums'>
                      {percent(entry.share)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ToggleGroup
            type='single'
            size='2xs'
            variant='outline'
            aria-label='Breakdown by'
            value={by}
            onValueChange={(value) => {
              if (value) {
                setBy(value as typeof by);
              }
            }}
          >
            <ToggleGroupItem value='members'>Members</ToggleGroupItem>
            <ToggleGroupItem value='types'>Types</ToggleGroupItem>
          </ToggleGroup>
          <StatList data-testid='timeline-results-breakdown' className='gap-1'>
            {rows.map((entry) => {
              const member = memberOf.get(entry.key);
              return (
                <StatRow
                  key={entry.key}
                  size='2xs'
                  className='items-center'
                  icon={
                    by === 'members' && member ? (
                      <Avatar src={member.avatar} size={16} shape='circle' />
                    ) : (
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          damageTypeBar(entry.key)
                        )}
                      />
                    )
                  }
                  label={entry.label}
                  labelClassName='min-w-0 truncate'
                  value={
                    <>
                      {formatNumber(
                        Math.round(entry.damage / view.countedDuration)
                      )}{' '}
                      <span className='font-normal text-subtle'>DPS</span>
                      <span className='ml-1.5 inline-block w-10 font-normal text-muted-foreground'>
                        {percent(entry.share)}
                      </span>
                    </>
                  }
                  valueClassName='shrink-0'
                />
              );
            })}
          </StatList>

          {/* How far the playhead is into the run's DMG. */}
          <div className='flex flex-col gap-1 border-t border-muted pt-2'>
            <span className='text-2xs text-subtle tabular-nums'>
              At {formatNumber(Math.round(time * 100) / 100)} s:{' '}
              <span className='text-foreground'>
                {formatNumber(Math.round(dealt))}
              </span>{' '}
              · {percent(damage.total > 0 ? dealt / damage.total : 0)}
            </span>
            <Meter
              value={dealt}
              max={damage.total}
              indicatorClassName='bg-amber-400/70'
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

// It follows the playhead at most every PANEL_QUANTUM.
export default memo(ResultsPanel, samePanelProps);
