import { PanelRightOpen } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import HitTablePanel from './HitTablePanel';
import ResultHeaderButton from './ResultHeaderButton';
import { getHitDetailsTitle, getHitLogButtonLabel } from '../_lib/labels';
import { HitLogEntry } from '../_lib/types';

type HitDetailsProps = {
  runId?: number;
  hits: HitLogEntry[] | null;
  csvFileName: string;
  'data-testid'?: string;
};

const HitDetails = ({
  runId,
  hits,
  csvFileName,
  'data-testid': testId = 'hit-details',
}: HitDetailsProps) => (
  <Sheet>
    <SheetTrigger asChild>
      <ResultHeaderButton data-testid={`${testId}-toggle`}>
        <PanelRightOpen className='size-3.5' />
        {getHitLogButtonLabel(hits?.length ?? null)}
      </ResultHeaderButton>
    </SheetTrigger>
    <SheetContent
      data-testid={testId}
      side='right'
      className='w-full gap-0 sm:max-w-[min(1400px,95vw)]'
    >
      <SheetHeader className='border-b pr-12'>
        <SheetTitle>{getHitDetailsTitle(hits?.length ?? null)}</SheetTitle>
        <SheetDescription>
          Every hit in the simulation, in order. Filter by attack, change the
          page size or export it as CSV.
        </SheetDescription>
      </SheetHeader>
      <HitTablePanel key={runId} csvFileName={csvFileName} hits={hits ?? []} />
    </SheetContent>
  </Sheet>
);

export default HitDetails;
