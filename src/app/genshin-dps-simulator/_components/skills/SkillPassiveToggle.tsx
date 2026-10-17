import { CheckedState } from '@radix-ui/react-checkbox';
import { useId } from 'react';

import { Label } from '@/components/ui/label';

import { useSkills } from './skillsContext';
import IconToggle from '../IconToggle';
import KitRowNote from '../KitRowNote';
import KitStatusBadge from '../KitStatusBadge';
import { PassiveData } from '../../_lib/characterSchema';
import { iconUrl } from '../../_lib/genshinIcons';
import { readFlag } from '../../_lib/readValue';
import { KitStatus } from '../../_lib/types';

type SkillPassiveToggleProps = {
  passive: PassiveData;
  toggleFlag: string;
};

const getToggleStatus = (checked: boolean): KitStatus => {
  if (!checked) {
    return 'disabled';
  }
  return 'applied';
};

const SkillPassiveToggle = ({
  passive,
  toggleFlag,
}: SkillPassiveToggleProps) => {
  const { parsedValues, onFlagChange } = useSkills();
  const checkboxId = useId();
  const checked = readFlag(parsedValues, toggleFlag);
  const testId = `kit-row-item-${passive.id}`;

  const handleCheckedChange = (state: CheckedState) => {
    onFlagChange(toggleFlag, state === true);
  };

  return (
    <li data-testid={testId} className='flex items-start gap-3 text-sm'>
      <IconToggle
        id={checkboxId}
        data-testid={`${testId}-toggle`}
        src={iconUrl(passive.icon)}
        alt={passive.name}
        checked={checked}
        onCheckedChange={handleCheckedChange}
      />
      <div className='min-w-0 flex-1'>
        <div className='flex items-start justify-between gap-2'>
          <Label htmlFor={checkboxId} className='block text-muted-foreground'>
            {passive.name}
          </Label>
          <KitStatusBadge status={getToggleStatus(checked)} />
        </div>
        <div data-testid={`${testId}-value`} className='font-medium'>
          {passive.value}
        </div>
        <KitRowNote note={passive.note} />
      </div>
    </li>
  );
};

export default SkillPassiveToggle;
