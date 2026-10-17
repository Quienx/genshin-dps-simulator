import { Card } from '@/components/ui/card';

import FieldList from './FieldList';
import HitDetails from './HitDetails';
import KitSection from './KitSection';
import NormalComboTable from './NormalComboTable';
import NormalOnlySimulationSummary from './NormalOnlySimulationSummary';
import formatNumber from '../_lib/formatNumber';
import {
  computeNormalOnlyRotation,
  NORMAL_ONLY_FIELDS,
} from '../_lib/normalOnlyRotation';
import { parseValues } from '../_lib/simulationValues';
import { DamageContext, SimulationValues } from '../_lib/types';

type NormalOnlyRotationCardProps = {
  buildId: number;
  runId?: number;
  values: SimulationValues;
  simulatedContext: DamageContext | null;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
};

const NormalOnlyRotationCard = ({
  buildId,
  runId,
  values,
  simulatedContext,
  onNumberChange,
  onFlagChange,
}: NormalOnlyRotationCardProps) => {
  const rotation = computeNormalOnlyRotation(parseValues(values));

  return (
    <Card data-testid='normal-only-rotation-card' className='p-4'>
      <h2 className='text-xl font-semibold'>
        Normal Attacks only rotation (no E)
      </h2>
      <p className='mt-1 text-sm text-muted-foreground'>
        Normal Attacks without using All Is Ash, so there is no Directive and no
        Bond of Life from it. Clicking “Simulate all” runs every hit that fits
        in the duration based on its animation, with random CRITs, and adds up
        the DMG of each one. It uses the build's ATK, CRIT, duration, enemy
        level, Physical DMG Bonus and Physical RES.
      </p>

      <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'>
        <div>
          <FieldList
            fields={NORMAL_ONLY_FIELDS}
            values={values}
            onNumberChange={onNumberChange}
            onFlagChange={onFlagChange}
          />
          <KitSection
            data-testid='normal-only-rotation-card-bonuses'
            title='Bonuses in this rotation'
            rows={rotation.bonusRows}
          />
        </div>

        <div>
          <NormalOnlySimulationSummary
            context={simulatedContext}
            rotationSeconds={rotation.rotationSeconds}
            expectedDamage={rotation.totalAverage}
          />

          <div
            data-testid='normal-only-rotation-card-summary'
            className='mt-3 rounded-lg border p-3 text-sm leading-7'
          >
            <strong>Reference: expected average</strong>
            <div>
              Hits in {formatNumber(rotation.rotationSeconds)} s (based on
              animation): {rotation.hitCount}
            </div>
            <div
              data-testid='normal-only-rotation-card-total'
              className='text-lg font-bold'
            >
              Average total DMG: {formatNumber(rotation.totalAverage)}
            </div>
            <div data-testid='normal-only-rotation-card-dps'>
              Average DPS: {formatNumber(rotation.averageDps)}
            </div>
            <div>No CRITs at all: {formatNumber(rotation.totalNonCrit)}</div>
            <div>All CRITs: {formatNumber(rotation.totalCrit)}</div>
            <div>
              Full combo ({formatNumber(rotation.comboSeconds)} s):{' '}
              {formatNumber(rotation.comboAverage)} on average
            </div>
          </div>

          <NormalComboTable hits={rotation.comboHits} />

          <HitDetails
            data-testid='normal-only-rotation-card-hit-details'
            runId={runId}
            hits={simulatedContext?.hitLog ?? null}
            csvFileName={`simulation-${buildId}-normal-attacks-only-hits.csv`}
          />
        </div>
      </div>
    </Card>
  );
};

export default NormalOnlyRotationCard;
