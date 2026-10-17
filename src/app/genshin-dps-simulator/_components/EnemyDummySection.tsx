import EnemyMultiplierBadge from './EnemyMultiplierBadge';
import FieldList from './FieldList';
import { CHARACTERS } from '../_lib/characters';
import {
  getEnemyDefenseMultiplier,
  getEnemyResistanceMultiplier,
} from '../_lib/damageEngine';
import {
  ENEMY_DUMMY_RESISTANCE_FIELDS,
  ENEMY_DUMMY_STAT_FIELDS,
  getCharacterDamageElements,
} from '../_lib/enemyDummy';
import { parseValues } from '../_lib/simulationValues';
import { SimulationValues } from '../_lib/types';

type EnemyDummySectionProps = {
  values: SimulationValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
};

const EnemyDummySection = ({
  values,
  onNumberChange,
  onFlagChange,
}: EnemyDummySectionProps) => {
  const parsedValues = parseValues(values);

  return (
    <section data-testid='enemy-dummy-section'>
      <p className='text-xs text-muted-foreground'>
        Every element defaults to 10% RES, the value most enemies have.
      </p>

      <div className='grid grid-cols-1 gap-x-3 sm:grid-cols-2'>
        <FieldList
          fields={ENEMY_DUMMY_STAT_FIELDS}
          values={values}
          onNumberChange={onNumberChange}
          onFlagChange={onFlagChange}
        />
      </div>
      <div className='grid grid-cols-1 gap-x-3 sm:grid-cols-2'>
        <FieldList
          fields={ENEMY_DUMMY_RESISTANCE_FIELDS}
          values={values}
          onNumberChange={onNumberChange}
          onFlagChange={onFlagChange}
        />
      </div>

      <div
        data-testid='enemy-dummy-section-multipliers'
        className='mt-3 flex flex-wrap gap-2 text-xs'
      >
        <EnemyMultiplierBadge
          label='DEF'
          multiplier={getEnemyDefenseMultiplier(parsedValues)}
        />
        {getCharacterDamageElements(CHARACTERS[values.character].element).map(
          (element) => (
            <EnemyMultiplierBadge
              key={element}
              label={`RES ${element}`}
              multiplier={getEnemyResistanceMultiplier(parsedValues, element)}
            />
          )
        )}
      </div>
    </section>
  );
};

export default EnemyDummySection;
