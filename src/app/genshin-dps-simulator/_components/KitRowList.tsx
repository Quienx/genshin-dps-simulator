import KitRowItem from './KitRowItem';
import { KitRow } from '../_lib/types';

type KitRowListProps = {
  rows: KitRow[];
  'data-testid'?: string;
};

const KitRowList = ({
  rows,
  'data-testid': testId = 'kit-row-list',
}: KitRowListProps) => (
  <ul data-testid={testId} className='mt-3 space-y-2'>
    {rows.map((row) => (
      <KitRowItem key={row.id} row={row} />
    ))}
  </ul>
);

export default KitRowList;
