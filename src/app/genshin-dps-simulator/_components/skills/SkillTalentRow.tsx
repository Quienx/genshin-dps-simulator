import SkillMultiplier from './SkillMultiplier';
import SkillRow from './SkillRow';
import { TalentRowData } from '../../_lib/characterSchema';

type SkillTalentRowProps = {
  row: TalentRowData;
};

const SkillTalentRow = ({ row }: SkillTalentRowProps) => {
  if (row.type === 'text') {
    return (
      <SkillRow
        id={row.id}
        label={row.label}
        value={row.value}
        note={row.note}
      />
    );
  }
  return <SkillMultiplier row={row} />;
};

export default SkillTalentRow;
