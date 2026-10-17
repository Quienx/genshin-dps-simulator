import TalentLevelSelect from './TalentLevelSelect';

type TalentLevelControlProps = {
  baseLevel: number;
  effectiveLevel: number;
  maxLevel: number;
  label: string;
  boostSource?: string;
  note?: string;
  onLevelChange: (level: string) => void;
  'data-testid'?: string;
};

const getBoostLabel = (
  baseLevel: number,
  effectiveLevel: number,
  boostSource?: string
): string | null => {
  if (effectiveLevel === baseLevel) {
    return null;
  }
  return `${boostSource} → Lv. ${effectiveLevel}`;
};

const TalentLevelControl = ({
  baseLevel,
  effectiveLevel,
  maxLevel,
  label,
  boostSource,
  note,
  onLevelChange,
  'data-testid': testId = 'talent-level-control',
}: TalentLevelControlProps) => (
  <span data-testid={testId} className='flex items-center gap-1.5'>
    <TalentLevelSelect
      data-testid={`${testId}-select`}
      level={baseLevel}
      maxLevel={maxLevel}
      label={label}
      onLevelChange={onLevelChange}
    />
    <span
      data-testid={`${testId}-boost`}
      className='font-semibold text-primary'
    >
      {getBoostLabel(baseLevel, effectiveLevel, boostSource)}
    </span>
    <span data-testid={`${testId}-note`}>{note}</span>
  </span>
);

export default TalentLevelControl;
