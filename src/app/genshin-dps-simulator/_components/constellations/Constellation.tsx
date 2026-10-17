import { CheckedState } from '@radix-ui/react-checkbox';
import { useId } from 'react';

import { Label } from '@/components/ui/label';

import { useConstellations } from './constellationsContext';
import DamageGainText from '../DamageGainText';
import IconToggle from '../IconToggle';
import KitStatusBadge from '../KitStatusBadge';
import { ConstellationData } from '../../_lib/characterSchema';
import { iconUrl } from '../../_lib/genshinIcons';
import { KitStatus } from '../../_lib/types';

type ConstellationProps = {
  constellation: ConstellationData;
};

const getConstellationStatus = (
  constellation: ConstellationData,
  checked: boolean
): KitStatus => {
  if (constellation.impact === 'none') {
    return 'no-effect';
  }
  if (constellation.impact === 'not-simulated') {
    return 'not-simulated';
  }
  if (!checked) {
    return 'disabled';
  }
  return 'applied';
};

const Constellation = ({ constellation }: ConstellationProps) => {
  const { values, gains, onFlagChange } = useConstellations();
  const checkboxId = useId();
  const checked = values.flags[constellation.id] ?? false;

  const handleCheckedChange = (state: CheckedState) => {
    onFlagChange(constellation.id, state === true);
  };

  return (
    <li
      data-testid={`constellation-toggle-${constellation.id}`}
      className='flex items-start gap-3 text-sm'
    >
      <IconToggle
        id={checkboxId}
        data-testid={`constellation-toggle-${constellation.id}-input`}
        src={iconUrl(constellation.icon)}
        alt={`C${constellation.level} ${constellation.name}`}
        checked={checked}
        onCheckedChange={handleCheckedChange}
      />
      <div className='min-w-0 flex-1'>
        <div className='flex items-start justify-between gap-2'>
          <Label htmlFor={checkboxId} className='block font-semibold'>
            <span className='text-primary'>C{constellation.level}</span>{' '}
            {constellation.name}
          </Label>
          <KitStatusBadge
            status={getConstellationStatus(constellation, checked)}
          />
        </div>
        <div className='text-xs'>
          <DamageGainText
            data-testid={`constellation-toggle-${constellation.id}-gain`}
            gain={gains.byConstellation[constellation.id]}
          />
        </div>
        <p>{constellation.effect}</p>
        <p className='text-xs text-muted-foreground'>{constellation.note}</p>
      </div>
    </li>
  );
};

export default Constellation;
