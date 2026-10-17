import { Button } from '@/components/ui/button';

type RotationModeSwitchProps = {
  isCustom: boolean;
  onChange: (isCustom: boolean) => void;
};

const RotationModeSwitch = ({
  isCustom,
  onChange,
}: RotationModeSwitchProps) => (
  <div
    data-testid='rotation-mode'
    role='group'
    aria-label='Rotation mode'
    className='inline-flex rounded-md border p-0.5'
  >
    <Button
      type='button'
      size='sm'
      variant={isCustom ? 'ghost' : 'secondary'}
      aria-pressed={!isCustom}
      onClick={() => onChange(false)}
    >
      Automatic
    </Button>
    <Button
      type='button'
      size='sm'
      variant={isCustom ? 'secondary' : 'ghost'}
      aria-pressed={isCustom}
      onClick={() => onChange(true)}
    >
      Custom
    </Button>
  </div>
);

export default RotationModeSwitch;
