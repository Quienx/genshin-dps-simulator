import ItemIcon from './ItemIcon';

type WeaponSummaryProps = {
  name: string;
  iconSrc: string;
  subtitle: string;
  dimmed: boolean;
};

const WeaponSummary = ({
  name,
  iconSrc,
  subtitle,
  dimmed,
}: WeaponSummaryProps) => (
  <div data-testid='weapon-summary' className='mb-2 flex items-center gap-3'>
    <ItemIcon
      data-testid='weapon-summary-icon'
      src={iconSrc}
      alt={name}
      dimmed={dimmed}
    />
    <div className='min-w-0'>
      <div className='font-semibold'>{name}</div>
      <div className='text-xs text-muted-foreground'>{subtitle}</div>
    </div>
  </div>
);

export default WeaponSummary;
