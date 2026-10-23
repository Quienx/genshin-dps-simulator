import { useCallback, useRef } from 'react';

// The same function on every render, calling the latest one it was given:
// for the memoized controls, whose callbacks the page makes anew each time
// (Fit reads the width, Simulate the team) and must not go stale.
const useLatestCallback = <A extends unknown[]>(
  callback: (...args: A) => void
) => {
  const latest = useRef(callback);
  latest.current = callback;
  return useCallback((...args: A) => latest.current(...args), []);
};

export default useLatestCallback;
