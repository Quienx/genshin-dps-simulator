import { CheckedState } from '@radix-ui/react-checkbox';
import { useId } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

import { CheckboxFieldDefinition } from '../_lib/types';

type CheckboxFieldProps = {
  field: CheckboxFieldDefinition;
  checked: boolean;
  onCheckedChange: (name: string, checked: boolean) => void;
};

const CheckboxField = ({
  field,
  checked,
  onCheckedChange,
}: CheckboxFieldProps) => {
  const checkboxId = useId();

  const handleCheckedChange = (state: CheckedState) => {
    onCheckedChange(field.name, state === true);
  };

  return (
    <div
      data-testid={`checkbox-field-${field.name}`}
      className='mt-3 flex items-center gap-2 sm:col-span-2'
    >
      <Checkbox
        id={checkboxId}
        data-testid={`checkbox-field-${field.name}-input`}
        checked={checked}
        onCheckedChange={handleCheckedChange}
      />
      <Label htmlFor={checkboxId}>{field.label}</Label>
    </div>
  );
};

export default CheckboxField;
