import { ChangeEvent, useId, useState } from 'react';

import { Input } from '@/components/ui/input';

type RotationSecondsFieldProps = {
  value: number;
  onChange: (seconds: number) => void;
};

const MIN_SECONDS = 0.1;

// Keeps its own text so half-typed values ("0.") are not reset; only a valid
// positive number is sent up.
const RotationSecondsField = ({
  value,
  onChange,
}: RotationSecondsFieldProps) => {
  const inputId = useId();
  const [text, setText] = useState(String(value));

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setText(event.target.value);
    const seconds = Number(event.target.value);
    if (event.target.value !== '' && seconds >= MIN_SECONDS) {
      onChange(seconds);
    }
  };

  return (
    <div className='flex items-center gap-1.5'>
      <label htmlFor={inputId} className='text-xs text-muted-foreground'>
        Seconds
      </label>
      <Input
        id={inputId}
        data-testid='rotation-seconds-input'
        type='number'
        min={MIN_SECONDS}
        step={0.1}
        value={text}
        onChange={handleChange}
        onBlur={() => setText(String(value))}
        className='h-7 w-20 px-2'
      />
    </div>
  );
};

export default RotationSecondsField;
