import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

import RotationActionIcon from './RotationActionIcon';
import RotationSecondsField from './RotationSecondsField';
import RotationStepper from './RotationStepper';
import { getBlockTitle } from '../../_lib/rotation/blocks';
import { RotationAction } from '../../_lib/rotation/rotationSchema';
import { RotationBlock } from '../../_lib/rotation/types';

export type BlockPatch = Partial<
  Pick<RotationBlock, 'hits' | 'repeat' | 'seconds' | 'dashCancel'>
>;

type RotationInspectorProps = {
  block: RotationBlock | null;
  action: RotationAction | null;
  warning: string | null;
  canDashCancel: boolean;
  onChange: (uid: string, patch: BlockPatch) => void;
  onRemove: (uid: string) => void;
};

// Settings of the selected timeline piece, so the pieces themselves stay small.
const RotationInspector = ({
  block,
  action,
  warning,
  canDashCancel,
  onChange,
  onRemove,
}: RotationInspectorProps) => {
  if (!block || !action) {
    return (
      <p
        data-testid='rotation-inspector-empty'
        className='text-xs text-muted-foreground'
      >
        Click a block on the timeline to change it. Drag blocks to reorder them.
      </p>
    );
  }

  return (
    <div
      data-testid='rotation-inspector'
      className='flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border p-2'
    >
      <span className='flex items-center gap-2 text-sm font-semibold'>
        <RotationActionIcon action={action} size={24} />
        {getBlockTitle(block, action)}
      </span>
      {(action.steps || action.kind === 'normal') &&
        (action.maxHits ?? 1) > 1 && (
          <RotationStepper
            data-testid='rotation-hits'
            label={action.hitsLabel ?? 'Hits'}
            value={block.hits}
            min={action.minHits ?? 1}
            max={action.maxHits}
            onChange={(hits) => onChange(block.uid, { hits })}
          />
        )}
      {action.kind === 'normal' && canDashCancel && (
        <label className='flex items-center gap-1.5 text-xs text-muted-foreground'>
          <Checkbox
            data-testid='rotation-dash-cancel'
            checked={block.dashCancel}
            onCheckedChange={(state) =>
              onChange(block.uid, { dashCancel: state === true })
            }
          />
          End with a Dash
        </label>
      )}
      {action.kind === 'wait' && (
        <RotationSecondsField
          key={block.uid}
          value={block.seconds}
          onChange={(seconds) => onChange(block.uid, { seconds })}
        />
      )}
      <RotationStepper
        data-testid='rotation-repeat'
        label='Repeat'
        value={block.repeat}
        min={1}
        format={(value) => `×${value}`}
        onChange={(repeat) => onChange(block.uid, { repeat })}
      />
      {warning && (
        <span
          data-testid='rotation-inspector-warning'
          className='text-xs text-amber-700 dark:text-amber-400'
        >
          ⚠ {warning}
        </span>
      )}
      <Button
        type='button'
        variant='ghost'
        size='sm'
        className='ml-auto'
        data-testid='rotation-remove'
        onClick={() => onRemove(block.uid)}
      >
        <Trash2 />
        Remove
      </Button>
    </div>
  );
};

export default RotationInspector;
