import ActivityTimeline from './ActivityTimeline';
import HitDetails from './HitDetails';
import SimulationResult from './SimulationResult';
import SimulationResultDetails from './SimulationResultDetails';
import { Build } from '../_lib/types';

type ResultsSectionProps = {
  build: Build;
};

// Last "Simulate all" run of a build: DMG meter plus the details and hit log.
const ResultsSection = ({ build }: ResultsSectionProps) => (
  <section data-testid='results-section' className='min-w-0'>
    <div className='mb-2 flex flex-wrap items-center gap-2'>
      <h2 className='text-sm font-semibold'>Results</h2>
      <span className='text-[11px] text-muted-foreground'>
        Updated when you click “Simulate all”
      </span>
      <div className='ml-auto flex gap-2'>
        <SimulationResultDetails outcome={build.outcome} />
        <HitDetails
          runId={build.outcome?.runId}
          hits={build.outcome?.context.hitLog ?? null}
          csvFileName={`simulation-${build.id}-hits.csv`}
        />
      </div>
    </div>
    <SimulationResult outcome={build.outcome} />
    {build.outcome && <ActivityTimeline outcome={build.outcome} />}
  </section>
);

export default ResultsSection;
