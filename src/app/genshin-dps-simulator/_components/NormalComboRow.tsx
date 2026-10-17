import { TableCell, TableRow } from '@/components/ui/table';

import formatNumber from '../_lib/formatNumber';
import { NormalComboHit } from '../_lib/normalOnlyRotation';

type NormalComboRowProps = {
  hit: NormalComboHit;
};

const CELL_CLASS_NAME = 'whitespace-nowrap text-right';

const NormalComboRow = ({ hit }: NormalComboRowProps) => (
  <TableRow data-testid={`normal-combo-row-${hit.id}`}>
    <TableCell className='whitespace-nowrap text-left'>{hit.label}</TableCell>
    <TableCell className={CELL_CLASS_NAME}>
      {formatNumber(hit.hitSecond)}
    </TableCell>
    <TableCell className={CELL_CLASS_NAME}>
      {formatNumber(hit.multiplier)}% ATK
    </TableCell>
    <TableCell className={CELL_CLASS_NAME}>
      {formatNumber(hit.nonCrit)}
    </TableCell>
    <TableCell className={CELL_CLASS_NAME}>{formatNumber(hit.crit)}</TableCell>
    <TableCell className={CELL_CLASS_NAME}>
      {formatNumber(hit.average)}
    </TableCell>
  </TableRow>
);

export default NormalComboRow;
