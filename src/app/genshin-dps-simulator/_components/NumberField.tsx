import { ChangeEvent, useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { NumberFieldDefinition } from '../_lib/types';

type NumberFieldProps = {
  field: NumberFieldDefinition;
  value: string;
  onValueChange: (name: string, value: string) => void;
};

const NumberField = ({ field, value, onValueChange }: NumberFieldProps) => {
  const inputId = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onValueChange(field.name, event.target.value);
  };

  return (
    <div
      data-testid={`number-field-${field.name}`}
      className='mt-3 space-y-1.5'
    >
      <Label htmlFor={inputId}>{field.label}</Label>
      <Input
        id={inputId}
        data-testid={`number-field-${field.name}-input`}
        type='number'
        value={value}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={handleChange}
      />
    </div>
  );
};

export default NumberField;
