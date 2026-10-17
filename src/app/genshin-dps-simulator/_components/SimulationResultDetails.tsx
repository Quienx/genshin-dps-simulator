import { Calculator } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import CategoryDamageRow from './CategoryDamageRow';
import ResultDetailRow from './ResultDetailRow';
import ResultHeaderButton from './ResultHeaderButton';
import { CHARACTER_LEVEL } from '../_lib/damageEngine';
import { SimulationOutcome } from '../_lib/types';

type SimulationResultDetailsProps = {
  outcome: SimulationOutcome | null;
};

const SimulationResultDetails = ({ outcome }: SimulationResultDetailsProps) => {
  if (!outcome) {
    return null;
  }

  const { context } = outcome;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <ResultHeaderButton data-testid='simulation-result-details-toggle'>
          <Calculator className='size-3.5' />
          Calculation details
        </ResultHeaderButton>
      </SheetTrigger>
      <SheetContent
        data-testid='simulation-result-details'
        side='right'
        className='gap-0 sm:max-w-md'
      >
        <SheetHeader className='border-b pr-12'>
          <SheetTitle>Calculation details</SheetTitle>
          <SheetDescription>
            The multipliers and counts behind this simulation.
          </SheetDescription>
        </SheetHeader>
        <div className='overflow-y-auto p-4 text-sm leading-7 break-words'>
          <div>Character level: {CHARACTER_LEVEL}</div>
          <div>Enemy level: {outcome.enemyLevel}</div>
          <div>DEF multiplier: {(context.defense * 100).toFixed(2)}%</div>
          <div>
            Pyro RES multiplier:{' '}
            {(context.resistanceByElement.Pyro * 100).toFixed(2)}%
          </div>
          <div>
            Hydro RES multiplier:{' '}
            {(context.resistanceByElement.Hydro * 100).toFixed(2)}%
          </div>
          <div>
            Physical RES multiplier:{' '}
            {(context.resistanceByElement.Physical * 100).toFixed(2)}%
          </div>
          <div data-testid='simulation-result-details-hits'>
            Hits counted: {context.totalHits}
          </div>
          <div data-testid='simulation-result-details-crits'>
            CRITs: {context.totalCrits}
          </div>
          {outcome.details.map((detail) => (
            <ResultDetailRow key={detail.label} detail={detail} />
          ))}
          {Object.entries(context.damageByCategory).map(
            ([category, damage]) => (
              <CategoryDamageRow
                key={category}
                category={category}
                damage={damage}
                crits={context.critsByCategory[category] ?? 0}
              />
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SimulationResultDetails;
