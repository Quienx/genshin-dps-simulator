import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { memo, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { PlayheadStore, useStoreValue } from './playhead';
import { sameShownProps } from './timelineData';
import useLatestCallback from './useLatestCallback';
import formatNumber from '../../_lib/formatNumber';

export const SPEEDS = [0.5, 1, 2, 4];

type TimelinePlayerProps = {
  duration: number;
  playhead: PlayheadStore;
  playing: boolean;
  speed: number;
  onTogglePlay: () => void;
  onStep: (direction: 1 | -1) => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (time: number) => void;
  onZoom: (direction: 1 | -1) => void;
  onFit: () => void;
  // The chart is on screen: Zoom and Fit have something to act on.
  zoomable?: boolean;
  className?: string;
};

// A player button, with its name and its key (if it has one) in a
// tooltip.
const IconButton = ({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant='secondary'
        size='icon-sm'
        aria-label={label}
        aria-keyshortcuts={shortcut}
        onClick={onClick}
        className='text-foreground'
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      {label}
      {shortcut && <Kbd className='ml-1.5'>{shortcut}</Kbd>}
    </TooltipContent>
  </Tooltip>
);

// Play, pause, step from event to event, and go to either end: drawn
// again only when playing starts or stops.
const PlayerButtons = memo(function PlayerButtons({
  playing,
  duration,
  onTogglePlay,
  onStep,
  onSeek,
}: Pick<
  TimelinePlayerProps,
  'playing' | 'duration' | 'onTogglePlay' | 'onStep' | 'onSeek'
>) {
  return (
    <div className='flex items-center gap-1'>
      <IconButton label='Go to start' shortcut='Home' onClick={() => onSeek(0)}>
        <SkipBack />
      </IconButton>
      <IconButton label='Previous event' onClick={() => onStep(-1)}>
        <ChevronLeft />
      </IconButton>
      <IconButton
        label={playing ? 'Pause' : 'Play'}
        shortcut='Space'
        onClick={onTogglePlay}
      >
        {playing ? <Pause /> : <Play />}
      </IconButton>
      <IconButton label='Next event' onClick={() => onStep(1)}>
        <ChevronRight />
      </IconButton>
      <IconButton
        label='Go to end'
        shortcut='End'
        onClick={() => onSeek(duration)}
      >
        <SkipForward />
      </IconButton>
    </div>
  );
},
sameShownProps);

const SpeedToggle = memo(function SpeedToggle({
  speed,
  onSpeedChange,
}: Pick<TimelinePlayerProps, 'speed' | 'onSpeedChange'>) {
  return (
    <ToggleGroup
      type='single'
      size='2xs'
      aria-label='Playback speed'
      value={String(speed)}
      onValueChange={(value) => {
        // Clicking the speed on again unpicks it (''): one stays.
        if (value) {
          onSpeedChange(Number(value));
        }
      }}
    >
      {SPEEDS.map((value) => (
        <ToggleGroupItem key={value} value={String(value)}>
          {value}×
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
},
sameShownProps);

// Zoom and Fit: the magnifiers say what they do (the tip names them).
const ZoomControls = memo(function ZoomControls({
  onZoom,
  onFit,
}: Pick<TimelinePlayerProps, 'onZoom' | 'onFit'>) {
  return (
    <div className='flex items-center gap-1'>
      <IconButton label='Zoom out' shortcut='-' onClick={() => onZoom(-1)}>
        <ZoomOut />
      </IconButton>
      <IconButton label='Zoom in' shortcut='+' onClick={() => onZoom(1)}>
        <ZoomIn />
      </IconButton>
      <Button
        variant='secondary'
        size='xs'
        title='Show the whole run'
        onClick={onFit}
        className='px-3'
      >
        Fit
      </Button>
    </div>
  );
},
sameShownProps);

// The clock and the slider: the only parts of the bar that follow every
// frame, so each reads the playhead itself (nothing else is redrawn).
const PlayheadClock = ({
  playhead,
  duration,
}: {
  playhead: PlayheadStore;
  duration: number;
}) => {
  const time = useStoreValue(playhead);
  return (
    <span
      data-testid='timeline-time'
      className='font-mono text-2xs whitespace-nowrap text-foreground tabular-nums'
    >
      {time.toFixed(3)} s{' '}
      <span className='text-subtle'>/ {formatNumber(duration)} s</span>
    </span>
  );
};

// It drags the run like a video's, taking the room the bar has left.
const TimeSlider = ({
  playhead,
  duration,
  onSeek,
}: {
  playhead: PlayheadStore;
  duration: number;
  onSeek: (time: number) => void;
}) => {
  const time = useStoreValue(playhead);
  return (
    <input
      type='range'
      aria-label='Time'
      data-testid='timeline-slider'
      min={0}
      max={duration}
      step={0.001}
      value={time}
      onChange={(event) => onSeek(Number(event.target.value))}
      className='h-1 min-w-32 flex-1 cursor-pointer accent-brand-500'
    />
  );
};

// The timeline's player, in its panel's bar: the buttons, the speed, the
// clock, the slider that drags the run like a video's, and the zoom.
const TimelinePlayer = ({
  duration,
  playhead,
  playing,
  speed,
  onTogglePlay: togglePlay,
  onStep: step,
  onSpeedChange: changeSpeed,
  onSeek: seek,
  onZoom: zoom,
  onFit: fit,
  zoomable = true,
  className,
}: TimelinePlayerProps) => {
  const onTogglePlay = useLatestCallback(togglePlay);
  const onStep = useLatestCallback(step);
  const onSpeedChange = useLatestCallback(changeSpeed);
  const onSeek = useLatestCallback(seek);
  const onZoom = useLatestCallback(zoom);
  const onFit = useLatestCallback(fit);
  return (
    <div
      data-testid='timeline-player'
      className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-1', className)}
    >
      <PlayerButtons
        playing={playing}
        duration={duration}
        onTogglePlay={onTogglePlay}
        onStep={onStep}
        onSeek={onSeek}
      />
      <SpeedToggle speed={speed} onSpeedChange={onSpeedChange} />
      <PlayheadClock playhead={playhead} duration={duration} />
      <TimeSlider playhead={playhead} duration={duration} onSeek={onSeek} />
      {zoomable && <ZoomControls onZoom={onZoom} onFit={onFit} />}
    </div>
  );
};

export default TimelinePlayer;
