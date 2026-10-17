import KitRowItem from '../KitRowItem';

type SkillRowProps = {
  id: string;
  label: string;
  value: string;
  note?: string;
};

const SkillRow = ({ id, label, value, note }: SkillRowProps) => (
  <KitRowItem row={{ id, label, value, note }} />
);

export default SkillRow;
