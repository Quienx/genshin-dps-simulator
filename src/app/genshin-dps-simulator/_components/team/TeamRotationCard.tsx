import { CheckedState } from '@radix-ui/react-checkbox';
import { RotateCcw } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import ActionBonuses from './ActionBonuses';
import ActionStats from './ActionStats';
import TeamResults from './TeamResults';
import TeamStateDetails from './TeamStateDetails';
import useTeamPreview from './useTeamPreview';
import CardTitle from '../CardTitle';
import RotationEditor from '../rotation/RotationEditor';
import RotationSummary from '../rotation/RotationSummary';
import { splitTeamActionId } from '../../_lib/engine/simulateTeam';
import {
  getFirstByBlock,
  getLastByBlock,
  setLoop,
} from '../../_lib/rotation/blocks';
import { getMemberStyle } from '../../_lib/rotation/memberStyles';
import {
  computeTimelineLayout,
  getDeadWait,
  PX_PER_SECOND,
} from '../../_lib/rotation/timelineLayout';
import { RotationSetting, RotationTraceEntry } from '../../_lib/rotation/types';
import {
  buildPresetRotation,
  getTeamActions,
  getTeamPaletteGroups,
  TeamRun,
  TeamState,
} from '../../_lib/team';

// Seconds spent waiting for cooldowns, within the run.
const getDeadTime = (trace: RotationTraceEntry[], duration: number): number =>
  Math.min(
    duration,
    trace.reduce(
      (total, entry) =>
        total +
        Math.max(
          0,
          Math.min(entry.startTime, duration) -
            Math.max(0, entry.startTime - getDeadWait(entry))
        ),
      0
    )
  );

// The timeline as rows of 10 s (six for a 60 s run).
const TEAM_ROW_SECONDS = 10;
// Room a row needs besides its seconds: its label and the gaps between
// pieces.
const ROW_LABEL_WIDTH = 64;
const ROW_SLACK = 0.85;

// Pixels per second so a row of `rowSeconds` fills `width`; never less
// than the default scale.
const getRowScale = (width: number, rowSeconds: number): number =>
  Math.max(PX_PER_SECOND, ((width - ROW_LABEL_WIDTH) * ROW_SLACK) / rowSeconds);

// The width of an element, kept up to date as it resizes.
const useWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};

type TeamRotationCardProps = {
  team: TeamState;
  // The last Simulate run; `stale` once the team changed since.
  outcome: { run: TeamRun; stale: boolean } | null;
  onRotationChange: (rotation: RotationSetting) => void;
  onFillChange: (fill: boolean) => void;
  onSwapDelayChange: (frames: number) => void;
};

// One timeline for the whole party: drag any member's actions in; a step
// of another member swaps to it first (1 s swap cooldown).
const TeamRotationCard = ({
  team,
  outcome,
  onRotationChange,
  onFillChange,
  onSwapDelayChange,
}: TeamRotationCardProps) => {
  const loopId = useId();
  const fillId = useId();
  const swapDelayId = useId();
  const ids = useMemo(
    () => team.members.map((values) => values.character),
    [team.members]
  );
  const actions = useMemo(() => getTeamActions(ids), [ids]);
  const paletteGroups = useMemo(
    () =>
      getTeamPaletteGroups(ids, actions).map((group) => ({
        id: group.characterId,
        label: group.name,
        avatar: group.avatar,
        labelClassName: getMemberStyle(group.slot).text,
        actions: group.actions,
      })),
    [ids, actions]
  );
  // Every block of a member wears its slot's color and its avatar.
  const memberFor = useMemo(() => {
    const members = new Map(
      getTeamPaletteGroups(ids, []).map((group) => [
        group.characterId,
        {
          chip: getMemberStyle(group.slot).chip,
          avatar: group.avatar,
          name: group.name,
        },
      ])
    );
    return (actionId: string) =>
      members.get(splitTeamActionId(actionId).characterId);
  }, [ids]);
  const preview = useTeamPreview(team);
  const { rotation } = team;
  const track = useWidth();
  const scale = getRowScale(track.width, TEAM_ROW_SECONDS);
  const layout = useMemo(
    () =>
      computeTimelineLayout(
        rotation.blocks,
        preview.trace,
        preview.duration,
        rotation.loop,
        scale
      ),
    [rotation, preview.trace, preview.duration, scale]
  );
  const info = useMemo(
    () => ({
      warnings: getFirstByBlock(preview.trace, 'warning'),
      notes: getLastByBlock(preview.trace, 'note'),
    }),
    [preview.trace]
  );
  // Reset reuses nothing, but the editor starts over (nothing selected).
  const [resetCount, setResetCount] = useState(0);

  const handleLoopChange = (state: CheckedState) =>
    onRotationChange(setLoop(rotation, state === true));

  const handleReset = () => {
    setResetCount((count) => count + 1);
    onRotationChange(buildPresetRotation(ids));
  };

  return (
    <Card data-testid='team-rotation-card' className='min-w-0 gap-0 p-4'>
      <CardTitle
        title='Team rotation'
        subtitle="Drag any member's actions onto one timeline; a step of another member swaps to it"
      />
      <div data-testid='team-outcome' className='mb-4 border-b pb-4'>
        {outcome ? (
          <>
            <TeamResults
              dps={outcome.run.dps}
              highestHit={outcome.run.highestHit}
              totalDamage={outcome.run.totalDamage}
              members={outcome.run.members}
              duration={outcome.run.duration}
              caption='team DPS (CRITs rolled)'
            />
            {outcome.stale && (
              <p
                data-testid='team-outcome-stale'
                className='mt-2 text-xs text-amber-600 dark:text-amber-400'
              >
                The team changed since this run: simulate again to update it.
              </p>
            )}
          </>
        ) : (
          <p className='text-sm text-muted-foreground'>
            Press Simulate team to run this rotation with CRITs rolled. The
            timeline below shows the expected damage as you edit.
          </p>
        )}
      </div>
      <div ref={track.ref} className='flex flex-col gap-3'>
        <RotationSummary
          dps={preview.dps}
          warnings={preview.trace.filter((entry) => entry.warning).length}
          deadTime={getDeadTime(preview.trace, preview.duration)}
          duration={preview.duration}
        />
        <RotationEditor
          key={resetCount}
          rotation={rotation}
          actions={actions}
          layout={layout}
          duration={preview.duration}
          combosByBlock={preview.combosByBlock}
          // What each step dealt in the Simulate run (CRIT or not), only
          // while it is the run of this very team.
          damageByBlock={
            outcome && !outcome.stale ? outcome.run.damageByBlock : {}
          }
          damageNote={
            outcome ? 'The team changed: simulate again' : 'Press Simulate team'
          }
          warningsByBlock={info.warnings}
          notesByBlock={info.notes}
          cooldowns={preview.cooldowns}
          // The icons in the tooltip show every cooldown.
          cooldownsFor={() => []}
          compactDetails
          trace={preview.trace}
          paletteGroups={paletteGroups}
          memberFor={memberFor}
          rowSeconds={TEAM_ROW_SECONDS}
          pieceExtra={(start, blockUid) => (
            <>
              <ActionStats run={preview} blockUid={blockUid} />
              {/* Side by side, so the tooltip stays short: the team's
                  skills, then the action's bonuses on the right. */}
              <div className='mt-2 flex max-w-[min(90vw,64rem)] items-start gap-4 border-t border-current/20 pt-1.5'>
                <TeamStateDetails run={preview} time={start} />
                <ActionBonuses run={preview} blockUid={blockUid} />
              </div>
            </>
          )}
          onChange={onRotationChange}
        />
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <Checkbox
              id={loopId}
              data-testid='team-rotation-loop'
              checked={rotation.loop}
              onCheckedChange={handleLoopChange}
            />
            <Label htmlFor={loopId}>
              Repeat the whole rotation until the simulation ends
            </Label>
          </div>
          <div className='flex items-center gap-2'>
            <Checkbox
              id={fillId}
              data-testid='team-rotation-fill'
              checked={team.fillWhileWaiting}
              onCheckedChange={(state) => onFillChange(state === true)}
            />
            <Label htmlFor={fillId}>
              While a teammate&apos;s skill recharges, the member on the field
              keeps attacking (its automatic rotation)
            </Label>
          </div>
          <div className='flex items-center gap-2'>
            <Label htmlFor={swapDelayId}>Swap delay (frames)</Label>
            <Input
              id={swapDelayId}
              data-testid='team-swap-delay'
              type='number'
              min={0}
              max={60}
              step={1}
              className='h-8 w-16'
              value={team.swapDelayFrames}
              title='Frames each swap takes before the next member is on the field (gcsim swap_delay; 12 is the usual value)'
              onChange={(event) => {
                const frames = Math.round(Number(event.target.value));
                if (Number.isFinite(frames)) {
                  onSwapDelayChange(Math.min(60, Math.max(0, frames)));
                }
              }}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            data-testid='team-rotation-reset'
            onClick={handleReset}
          >
            <RotateCcw />
            Reset to the preset
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default TeamRotationCard;
