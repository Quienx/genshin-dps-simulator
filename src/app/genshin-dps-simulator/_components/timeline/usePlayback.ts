import { useCallback, useEffect, useRef, useState } from 'react';

// A run, replayed: the cursor's time, played in real time × speed, and
// stepped from one moment to the next (an action or a block starting).
const usePlayback = (duration: number, stepTimes: number[]) => {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return undefined;
    }
    let handle = 0;
    const tick = (now: number) => {
      const elapsed = last.current === null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setTime((current) => {
        const next = current + elapsed * speed;
        if (next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, speed, duration]);

  const togglePlay = useCallback(() => {
    setTime((current) => (current >= duration ? 0 : current));
    setPlaying((value) => !value);
  }, [duration]);

  const stepTo = useCallback(
    (direction: 1 | -1) => {
      setPlaying(false);
      const epsilon = 1e-6;
      setTime((current) => {
        const next =
          direction === 1
            ? stepTimes.find((entry) => entry > current + epsilon)
            : [...stepTimes]
                .reverse()
                .find((entry) => entry < current - epsilon);
        return next ?? (direction === 1 ? duration : 0);
      });
    },
    [stepTimes, duration]
  );

  // Moving the cursor by hand stops playback.
  const seek = useCallback(
    (value: number) => {
      setPlaying(false);
      setTime(Math.min(duration, Math.max(0, value)));
    },
    [duration]
  );

  return { time, playing, speed, setSpeed, togglePlay, stepTo, seek };
};

export default usePlayback;
