type SeriesSwatchProps = {
  color: string;
};

const SeriesSwatch = ({ color }: SeriesSwatchProps) => (
  <svg
    data-testid='series-swatch'
    aria-hidden
    viewBox='0 0 8 8'
    className='size-2 shrink-0'
  >
    <circle cx='4' cy='4' r='4' fill={color} />
  </svg>
);

export default SeriesSwatch;
