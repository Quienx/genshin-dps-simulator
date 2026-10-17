import SkillPassiveToggle from './SkillPassiveToggle';
import KitRowItem from '../KitRowItem';
import { PassiveData } from '../../_lib/characterSchema';
import { iconUrl } from '../../_lib/genshinIcons';

type SkillPassiveProps = {
  passive: PassiveData;
};

const SkillPassive = ({ passive }: SkillPassiveProps) => {
  if (passive.toggleFlag) {
    return (
      <SkillPassiveToggle passive={passive} toggleFlag={passive.toggleFlag} />
    );
  }

  return (
    <KitRowItem
      row={{
        id: passive.id,
        label: passive.name,
        value: passive.value,
        note: passive.note,
        iconSrc: iconUrl(passive.icon),
      }}
    />
  );
};

export default SkillPassive;
