import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import HitTableRow from './HitTableRow';
import { HitLogEntry } from '../_lib/types';

type HitTableProps = {
  hits: HitLogEntry[];
};

const NUMERIC_HEAD_CLASS_NAME = 'whitespace-nowrap text-right';
const TEXT_HEAD_CLASS_NAME = 'whitespace-nowrap text-left';

const HitTable = ({ hits }: HitTableProps) => (
  <div
    data-testid='hit-table'
    className='min-h-0 flex-1 overflow-auto border-y [&>[data-slot=table-container]]:overflow-visible'
  >
    <Table className='text-xs'>
      <TableHeader className='sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]'>
        <TableRow>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>#</TableHead>
          <TableHead className={TEXT_HEAD_CLASS_NAME}>Time (s)</TableHead>
          <TableHead className={TEXT_HEAD_CLASS_NAME}>Attack</TableHead>
          <TableHead className={TEXT_HEAD_CLASS_NAME}>Element</TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>Stacks</TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>
            Multiplier (%)
          </TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>Base DMG</TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>
            Total DMG Bonus (%)
          </TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>
            CRIT Rate (%)
          </TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>CRIT</TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>Reaction</TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>
            Reaction mult.
          </TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>DMG dealt</TableHead>
          <TableHead className={NUMERIC_HEAD_CLASS_NAME}>
            Cumulative DMG
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {hits.map((hit) => (
          <HitTableRow key={hit.index} hit={hit} />
        ))}
      </TableBody>
    </Table>
  </div>
);

export default HitTable;
