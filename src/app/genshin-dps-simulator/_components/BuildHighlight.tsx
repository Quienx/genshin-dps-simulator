import { BuildHighlightView } from '../_lib/sectionTypes';

type BuildHighlightProps = {
  highlight: BuildHighlightView | null;
};

const BuildHighlight = ({ highlight }: BuildHighlightProps) => {
  if (!highlight) {
    return null;
  }

  return (
    <div
      data-testid='max-bonus-summary'
      className='mb-4 rounded-lg bg-muted px-3 py-2 text-sm'
    >
      {highlight.label}: <strong>{highlight.value}</strong>
    </div>
  );
};

export default BuildHighlight;
