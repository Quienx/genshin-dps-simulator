export const getCritLabel = (isCrit: boolean): string => {
  if (!isCrit) {
    return 'No';
  }
  return 'Yes';
};

export const getCritSuffix = (isCrit: boolean): string => {
  if (!isCrit) {
    return '(no CRIT)';
  }
  return '(CRIT)';
};

export const getStacksLabel = (stacks: number | null): string => {
  if (stacks === null) {
    return '—';
  }
  return String(stacks);
};

export const getHitDetailsTitle = (hitCount: number | null): string => {
  if (hitCount === null) {
    return 'Hit-by-hit details';
  }
  return `Hit-by-hit details (${hitCount} hits logged)`;
};

export const getHitLogButtonLabel = (hitCount: number | null): string => {
  if (hitCount === null) {
    return 'Hit log';
  }
  return `Hit log (${hitCount})`;
};

export const toTestIdSlug = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
