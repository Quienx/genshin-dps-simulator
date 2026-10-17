import KitRowIcon from './KitRowIcon';
import KitRowNote from './KitRowNote';
import KitStatusBadge from './KitStatusBadge';
import { KitRow } from '../_lib/types';

type KitRowItemProps = {
  row: KitRow;
};

const KitRowItem = ({ row }: KitRowItemProps) => (
  <li data-testid={`kit-row-item-${row.id}`} className='flex gap-3 text-sm'>
    <KitRowIcon rowId={row.id} label={row.label} src={row.iconSrc} />
    <div className='min-w-0 flex-1'>
      <div className='flex items-start justify-between gap-2'>
        <span className='text-muted-foreground'>{row.label}</span>
        <KitStatusBadge status={row.status} />
      </div>
      <div data-testid={`kit-row-item-${row.id}-value`} className='font-medium'>
        {row.value}
      </div>
      <KitRowNote note={row.note} />
    </div>
  </li>
);

export default KitRowItem;
