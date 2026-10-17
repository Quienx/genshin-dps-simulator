import { Card } from '@/components/ui/card';

import CardTitle from './CardTitle';
import FieldGrid from './FieldGrid';
import { CHARACTERS } from '../_lib/characters';
import { getFieldsBySection } from '../_lib/simulationFields';
import { SimulationValues } from '../_lib/types';

type SimulationSettingsCardProps = {
  values: SimulationValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
  // Fields to leave out (a team member's solo-only options).
  hideField?: (name: string) => boolean;
};

const SimulationSettingsCard = ({
  values,
  onNumberChange,
  onFlagChange,
  hideField,
}: SimulationSettingsCardProps) => (
  <Card data-testid='simulation-settings-card' className='min-w-0 p-4'>
    <CardTitle title='Simulation' subtitle='Length and rotation' />
    <FieldGrid
      fields={getFieldsBySection(
        CHARACTERS[values.character],
        'rotation'
      ).filter((field) => !hideField?.(field.name))}
      values={values}
      onNumberChange={onNumberChange}
      onFlagChange={onFlagChange}
    />
  </Card>
);

export default SimulationSettingsCard;
