const NUMBER_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const formatNumber = (value: number): string => NUMBER_FORMAT.format(value);

export default formatNumber;
