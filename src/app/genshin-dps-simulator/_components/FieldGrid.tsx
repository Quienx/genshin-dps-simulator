import FieldList from './FieldList';
import { FieldDefinition, SimulationValues } from '../_lib/types';

type FieldGridProps = {
  fields: FieldDefinition[];
  values: SimulationValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
  'data-testid'?: string;
};

const FieldGrid = ({
  fields,
  values,
  onNumberChange,
  onFlagChange,
  'data-testid': testId = 'field-grid',
}: FieldGridProps) => (
  <div data-testid={testId} className='grid grid-cols-1 gap-x-3 sm:grid-cols-2'>
    <FieldList
      fields={fields}
      values={values}
      onNumberChange={onNumberChange}
      onFlagChange={onFlagChange}
    />
  </div>
);

export default FieldGrid;
