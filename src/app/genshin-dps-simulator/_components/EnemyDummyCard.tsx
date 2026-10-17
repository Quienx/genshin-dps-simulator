import { Card } from '@/components/ui/card';

import CardTitle from './CardTitle';
import EnemyDummySection from './EnemyDummySection';
import { SimulationValues } from '../_lib/types';

type EnemyDummyCardProps = {
  values: SimulationValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
};

const EnemyDummyCard = ({
  values,
  onNumberChange,
  onFlagChange,
}: EnemyDummyCardProps) => (
  <Card data-testid='enemy-dummy-card' className='min-w-0 p-4'>
    <CardTitle title='Test dummy' subtitle='Enemy level and resistances' />
    <EnemyDummySection
      values={values}
      onNumberChange={onNumberChange}
      onFlagChange={onFlagChange}
    />
  </Card>
);

export default EnemyDummyCard;
