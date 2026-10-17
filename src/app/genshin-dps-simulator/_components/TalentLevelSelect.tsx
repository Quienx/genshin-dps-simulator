import { cn } from '@/lib/utils';

import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import TalentLevelOption from './TalentLevelOption';

type TalentLevelSelectProps = {
  level: number;
  maxLevel: number;
  label: string;
  onLevelChange: (level: string) => void;
  // Extra classes for the trigger (a fixed width, for instance).
  className?: string;
  'data-testid'?: string;
};

const getLevels = (maxLevel: number): number[] =>
  Array.from({ length: maxLevel }, (_, index) => index + 1);

const TalentLevelSelect = ({
  level,
  maxLevel,
  label,
  onLevelChange,
  className,
  'data-testid': testId = 'talent-level-select',
}: TalentLevelSelectProps) => (
  <Select value={String(level)} onValueChange={onLevelChange}>
    <SelectTrigger
      data-testid={testId}
      aria-label={label}
      size='sm'
      className={cn('h-7 w-auto gap-1 px-2 text-xs', className)}
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {getLevels(maxLevel).map((option) => (
        <TalentLevelOption
          key={option}
          data-testid={`${testId}-option`}
          level={option}
        />
      ))}
    </SelectContent>
  </Select>
);

export default TalentLevelSelect;
