import { CheckedState } from '@radix-ui/react-checkbox';
import { RotateCcw } from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import RotationEditor from './RotationEditor';
import RotationModeSwitch from './RotationModeSwitch';
import RotationSummary from './RotationSummary';
import RotationTrack from './RotationTrack';
import useRotationPreview from './useRotationPreview';
import CardTitle from '../CardTitle';
import ResultsSection from '../ResultsSection';
import { CHARACTERS } from '../../_lib/characters';
import { buildAutomaticRotation } from '../../_lib/rotation/automaticRotation';
import {
  getFirstByBlock,
  getLastByBlock,
  getRotationActions,
  setLoop,
} from '../../_lib/rotation/blocks';
import {
  computeTimelineLayout,
  getDeadWait,
} from '../../_lib/rotation/timelineLayout';
import { RotationSetting, RotationTraceEntry } from '../../_lib/rotation/types';
import { Build } from '../../_lib/types';

type RotationCardProps = {
  build: Build;
  onRotationChange: (rotation: RotationSetting | null) => void;
  'data-testid'?: string;
};

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

const countWarnings = (trace: RotationTraceEntry[]): number =>
  trace.filter((entry) => entry.warning).length;

const RotationCard = ({
  build,
  onRotationChange,
  'data-testid': testId = 'rotation-card',
}: RotationCardProps) => {
  const { values } = build;
  const loopId = useId();
  const data = CHARACTERS[values.character].rotation;
  const actions = useMemo(() => (data ? getRotationActions(data) : []), [data]);
  const preview = useRotationPreview(values);
  const rotation = values.rotation;
  const customTrace = preview.custom?.trace;

  const automaticLayout = useMemo(
    () =>
      computeTimelineLayout(
        preview.automatic.rotation.blocks,
        preview.automatic.blockTrace,
        preview.duration,
        false
      ),
    [preview]
  );
  const customLayout = useMemo(
    () =>
      rotation
        ? computeTimelineLayout(
            rotation.blocks,
            customTrace ?? [],
            preview.duration,
            rotation.loop
          )
        : null,
    [rotation, customTrace, preview.duration]
  );
  const automaticTrace = preview.automatic.blockTrace;
  const automaticInfo = useMemo(
    () => ({
      warnings: getFirstByBlock(automaticTrace, 'warning'),
      notes: getLastByBlock(automaticTrace, 'note'),
    }),
    [automaticTrace]
  );
  const customInfo = useMemo(
    () => ({
      warnings: getFirstByBlock(customTrace ?? [], 'warning'),
      notes: getLastByBlock(customTrace ?? [], 'note'),
    }),
    [customTrace]
  );

  // Reset reuses block ids, so the editor starts over (nothing selected).
  const [resetCount, setResetCount] = useState(0);

  if (!data) {
    return null;
  }

  // Custom mode starts from a copy of what the automatic logic played for
  // this build, so the user edits a rotation that already works.
  const handleModeChange = (isCustom: boolean) => {
    onRotationChange(
      isCustom ? rotation ?? buildAutomaticRotation(values) : null
    );
  };

  const handleLoopChange = (state: CheckedState) => {
    if (rotation) {
      onRotationChange(setLoop(rotation, state === true));
    }
  };

  const handleReset = () => {
    setResetCount((count) => count + 1);
    onRotationChange(buildAutomaticRotation(values));
  };

  return (
    <Card data-testid={testId} className='min-w-0 gap-0 p-4'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <CardTitle
          title='Rotation'
          subtitle='Which actions the character performs over time'
        />
        <RotationModeSwitch
          isCustom={rotation !== null}
          onChange={handleModeChange}
        />
      </div>

      <div className='mb-4 border-b pb-4'>
        <ResultsSection build={build} />
      </div>

      {!rotation && (
        <div className='flex flex-col gap-3'>
          <p
            data-testid='rotation-automatic-description'
            className='text-sm text-muted-foreground'
          >
            {data.automaticDescription} These are the actions it picked for this
            build; switch to Custom to edit a copy.
          </p>
          <RotationSummary
            dps={preview.automatic.dps}
            warnings={countWarnings(automaticTrace)}
            deadTime={getDeadTime(preview.automatic.trace, preview.duration)}
            duration={preview.duration}
          />
          <RotationTrack
            readOnly
            layout={automaticLayout}
            blocks={preview.automatic.rotation.blocks}
            actions={actions}
            duration={preview.duration}
            combosByBlock={preview.automatic.combosByBlock}
            damageByBlock={preview.automatic.damageByBlock}
            warningsByBlock={automaticInfo.warnings}
            notesByBlock={automaticInfo.notes}
            cooldowns={preview.automatic.cooldowns}
            trace={preview.automatic.trace}
          />
        </div>
      )}

      {rotation && customLayout && (
        <div className='flex flex-col gap-3'>
          {preview.custom && (
            <RotationSummary
              dps={preview.custom.dps}
              automaticDps={preview.automatic.dps}
              warnings={countWarnings(preview.custom.trace)}
              deadTime={getDeadTime(preview.custom.trace, preview.duration)}
              duration={preview.duration}
            />
          )}
          <RotationEditor
            key={resetCount}
            rotation={rotation}
            actions={actions}
            layout={customLayout}
            duration={preview.duration}
            combosByBlock={preview.custom?.combosByBlock ?? {}}
            damageByBlock={preview.custom?.damageByBlock ?? {}}
            warningsByBlock={customInfo.warnings}
            notesByBlock={customInfo.notes}
            cooldowns={preview.custom?.cooldowns ?? []}
            trace={preview.custom?.trace}
            onChange={onRotationChange}
          />
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
              <Checkbox
                id={loopId}
                data-testid='rotation-loop'
                checked={rotation.loop}
                onCheckedChange={handleLoopChange}
              />
              <Label htmlFor={loopId}>
                Repeat the whole rotation until the simulation ends
              </Label>
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              data-testid='rotation-reset'
              onClick={handleReset}
            >
              <RotateCcw />
              Reset to automatic
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default RotationCard;
