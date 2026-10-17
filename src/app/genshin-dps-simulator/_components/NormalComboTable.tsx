import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import NormalComboRow from './NormalComboRow';
import { NormalComboHit } from '../_lib/normalOnlyRotation';

type NormalComboTableProps = {
  hits: NormalComboHit[];
};

const HEAD_CLASS_NAME = 'whitespace-nowrap text-right';

const NormalComboTable = ({ hits }: NormalComboTableProps) => (
  <div data-testid='normal-combo-table' className='mt-4 rounded-lg border'>
    <Table className='text-xs'>
      <TableHeader>
        <TableRow>
          <TableHead className='whitespace-nowrap text-left'>Hit</TableHead>
          <TableHead className={HEAD_CLASS_NAME}>Impact (s)</TableHead>
          <TableHead className={HEAD_CLASS_NAME}>Multiplier</TableHead>
          <TableHead className={HEAD_CLASS_NAME}>Non-CRIT</TableHead>
          <TableHead className={HEAD_CLASS_NAME}>CRIT</TableHead>
          <TableHead className={HEAD_CLASS_NAME}>Average</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {hits.map((hit) => (
          <NormalComboRow key={hit.id} hit={hit} />
        ))}
      </TableBody>
    </Table>
  </div>
);

export default NormalComboTable;
