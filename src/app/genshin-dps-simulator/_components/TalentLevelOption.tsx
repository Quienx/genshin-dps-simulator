import { SelectItem } from '@/components/ui/select';

type TalentLevelOptionProps = {
  level: number;
  'data-testid'?: string;
};

const TalentLevelOption = ({
  level,
  'data-testid': testId = 'talent-level-option',
}: TalentLevelOptionProps) => (
  <SelectItem data-testid={`${testId}-${level}`} value={String(level)}>
    Lv. {level}
  </SelectItem>
);

export default TalentLevelOption;
