import { useSkills, useTalent } from './skillsContext';
import KitRowItem from '../KitRowItem';
import { MultiplierRowData } from '../../_lib/characterSchema';
import { formatMultiplierRow } from '../../_lib/talents';

type SkillMultiplierProps = {
  row: MultiplierRowData;
};

const SkillMultiplier = ({ row }: SkillMultiplierProps) => {
  const { parsedValues } = useSkills();
  const { level } = useTalent();

  return (
    <KitRowItem
      row={{
        id: row.id,
        label: row.label,
        value: formatMultiplierRow(row, level, parsedValues),
        note: row.note,
      }}
    />
  );
};

export default SkillMultiplier;
