import CheckboxField from './CheckboxField';
import NumberField from './NumberField';
import { FieldDefinition, SimulationValues } from '../_lib/types';

type SimulationFieldProps = {
  field: FieldDefinition;
  values: SimulationValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
};

const SimulationField = ({
  field,
  values,
  onNumberChange,
  onFlagChange,
}: SimulationFieldProps) => {
  if (field.kind === 'checkbox') {
    return (
      <CheckboxField
        field={field}
        checked={values.flags[field.name] ?? false}
        onCheckedChange={onFlagChange}
      />
    );
  }

  return (
    <NumberField
      field={field}
      value={values.numbers[field.name] ?? ''}
      onValueChange={onNumberChange}
    />
  );
};

export default SimulationField;
