import { Card } from '@/components/ui/card';

import CardTitle from '../CardTitle';
import FieldGrid from '../FieldGrid';
import KitRowList from '../KitRowList';
import WeaponSummary from '../WeaponSummary';
import { WeaponData } from '../../_lib/characterSchema';
import { iconUrl } from '../../_lib/genshinIcons';
import { FieldHandlers } from '../../_lib/sectionTypes';
import { parseValues } from '../../_lib/simulationValues';
import {
  buildWeaponRows,
  getWeaponFields,
  getWeaponSubtitle,
  isWeaponEquipped,
} from '../../_lib/weapons';

type WeaponCardProps = FieldHandlers & {
  weapon: WeaponData;
  'data-testid'?: string;
};

const WeaponCard = ({
  weapon,
  values,
  onNumberChange,
  onFlagChange,
  'data-testid': testId = 'weapon-card',
}: WeaponCardProps) => {
  const parsedValues = parseValues(values);

  return (
    <Card data-testid={testId} className='min-w-0 p-4'>
      <CardTitle title='Weapon' />
      <WeaponSummary
        name={weapon.name}
        iconSrc={iconUrl(weapon.icon)}
        subtitle={getWeaponSubtitle(weapon, parsedValues)}
        dimmed={!isWeaponEquipped(weapon, parsedValues)}
      />
      <FieldGrid
        fields={getWeaponFields(weapon)}
        values={values}
        onNumberChange={onNumberChange}
        onFlagChange={onFlagChange}
      />
      <KitRowList
        data-testid={`${testId}-rows`}
        rows={buildWeaponRows(weapon, parsedValues)}
      />
    </Card>
  );
};

export default WeaponCard;
