import TalentIcon from './TalentIcon';

type KitRowIconProps = {
  rowId: string;
  label: string;
  src?: string;
};

const KitRowIcon = ({ rowId, label, src }: KitRowIconProps) => {
  if (!src) {
    return null;
  }
  return (
    <TalentIcon data-testid={`kit-row-icon-${rowId}`} src={src} alt={label} />
  );
};

export default KitRowIcon;
