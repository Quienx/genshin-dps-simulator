import SimulationField from './SimulationField';
import { FieldDefinition, SimulationValues } from '../_lib/types';

type FieldListProps = {
  fields: FieldDefinition[];
  values: SimulationValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
};

const FieldList = ({
  fields,
  values,
  onNumberChange,
  onFlagChange,
}: FieldListProps) => (
  <div data-testid='field-list' className='contents'>
    {fields.map((field) => (
      <SimulationField
        key={field.name}
        field={field}
        values={values}
        onNumberChange={onNumberChange}
        onFlagChange={onFlagChange}
      />
    ))}
  </div>
);

export default FieldList;
