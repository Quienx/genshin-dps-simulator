import { cn } from '@/lib/utils';

import { TableCell, TableRow } from '@/components/ui/table';

import formatNumber from '../_lib/formatNumber';
import { getCritLabel, getStacksLabel } from '../_lib/labels';
import { HitLogEntry } from '../_lib/types';

type HitTableRowProps = {
  hit: HitLogEntry;
};

const NUMERIC_CELL_CLASS_NAME = 'whitespace-nowrap text-right';
const TEXT_CELL_CLASS_NAME = 'whitespace-nowrap text-left';
const CRIT_CELL_CLASS_NAME = 'font-bold text-warning-foreground';

const HitTableRow = ({ hit }: HitTableRowProps) => {
  const critHighlight = cn(
    NUMERIC_CELL_CLASS_NAME,
    hit.isCrit && CRIT_CELL_CLASS_NAME
  );

  return (
    <TableRow
      data-testid={`hit-table-row-${hit.index}`}
      className='even:bg-muted/50'
    >
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>{hit.index}</TableCell>
      <TableCell className={TEXT_CELL_CLASS_NAME}>
        {formatNumber(hit.time)}
      </TableCell>
      <TableCell className={TEXT_CELL_CLASS_NAME} title={hit.notes}>
        {hit.category}
      </TableCell>
      <TableCell
        data-testid='hit-table-row-element'
        className={TEXT_CELL_CLASS_NAME}
      >
        {hit.element}
      </TableCell>
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>
        {getStacksLabel(hit.stacks)}
      </TableCell>
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>
        {formatNumber(hit.multiplier)}%
      </TableCell>
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>
        {formatNumber(hit.baseDamage)}
      </TableCell>
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>
        {formatNumber(hit.totalBonus)}%
      </TableCell>
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>
        {formatNumber(hit.critRate * 100)}%
      </TableCell>
      <TableCell data-testid='hit-table-row-crit' className={critHighlight}>
        {getCritLabel(hit.isCrit)}
      </TableCell>
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>{hit.reaction}</TableCell>
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>
        {formatNumber(hit.reactionMultiplier)}x
      </TableCell>
      <TableCell data-testid='hit-table-row-damage' className={critHighlight}>
        {formatNumber(hit.damage)}
      </TableCell>
      <TableCell className={NUMERIC_CELL_CLASS_NAME}>
        {formatNumber(hit.cumulativeDamage)}
      </TableCell>
    </TableRow>
  );
};

export default HitTableRow;
