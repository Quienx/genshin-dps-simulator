import { CheckedState } from '@radix-ui/react-checkbox';
import { useId } from 'react';

import { cn } from '@/lib/utils';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import ItemIcon from '../ItemIcon';
import {
  ARTIFACT_SLOTS,
  computeScreenStats,
  createDefaultArtifacts,
  formatScreenTotals,
  MAIN_STATS,
  SCREEN_STAT_LABELS,
  SUBSTATS,
} from '../../_lib/artifacts';
import { CharacterData, ScreenStat } from '../../_lib/characterSchema';
import formatNumber from '../../_lib/formatNumber';
import { relicIconUrl } from '../../_lib/genshinIcons';
import { parseValues } from '../../_lib/simulationValues';
import {
  ArtifactBuild,
  ArtifactLine,
  ArtifactSlot,
  SimulationValues,
} from '../../_lib/types';

// Radix Select has no empty value: this one stands for "no substat".
const NO_STAT = 'none';

type ArtifactEditorProps = {
  character: CharacterData;
  values: SimulationValues;
  onArtifactsChange: (artifacts: ArtifactBuild) => void;
};

const statLabel = (character: CharacterData, stat: ScreenStat): string =>
  stat === 'elementalDmg'
    ? `${character.element} DMG%`
    : SCREEN_STAT_LABELS[stat];

type LineEditorProps = {
  character: CharacterData;
  line: ArtifactLine;
  options: ScreenStat[];
  allowEmpty: boolean;
  label: string;
  // Substats: narrower, two per row.
  compact?: boolean;
  onChange: (line: ArtifactLine) => void;
};

// One stat line: which stat, and its value as typed.
const LineEditor = ({
  character,
  line,
  options,
  allowEmpty,
  label,
  compact = false,
  onChange,
}: LineEditorProps) => (
  <div className='flex items-center gap-1'>
    <Select
      value={line.stat === '' ? NO_STAT : line.stat}
      onValueChange={(stat) =>
        onChange({
          stat: stat === NO_STAT ? '' : (stat as ScreenStat),
          value: line.value,
        })
      }
    >
      <SelectTrigger
        size='sm'
        aria-label={`${label} stat`}
        className={cn('px-2 text-xs', compact ? 'w-24' : 'w-36')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value={NO_STAT}>—</SelectItem>}
        {options.map((stat) => (
          <SelectItem key={stat} value={stat}>
            {statLabel(character, stat)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Input
      type='number'
      step={0.1}
      min={0}
      aria-label={`${label} value`}
      value={line.value}
      disabled={line.stat === ''}
      onChange={(event) => onChange({ ...line, value: event.target.value })}
      className={cn('h-8 px-2 text-xs', compact ? 'w-16' : 'w-20')}
    />
  </div>
);

const SLOT_LABELS: Record<ArtifactSlot, string> = {
  flower: 'Flower',
  plume: 'Plume',
  sands: 'Sands',
  goblet: 'Goblet',
  circlet: 'Circlet',
};

// The five pieces, main stat and four substats each, as the game shows
// them; while on, the character screen's totals are computed from them.
const ArtifactEditor = ({
  character,
  values,
  onArtifactsChange,
}: ArtifactEditorProps) => {
  const toggleId = useId();
  const artifacts = values.artifacts ?? createDefaultArtifacts();
  const icons = new Map(
    character.artifactSet.pieces.map((piece) => [piece.id, piece.icon])
  );

  const handleToggle = (state: CheckedState) =>
    onArtifactsChange({ ...artifacts, enabled: state === true });

  const updateLine = (
    slot: ArtifactSlot,
    index: number | 'main',
    line: ArtifactLine
  ) => {
    const piece = artifacts.pieces[slot];
    // A new main stat starts at its +20 value.
    const main =
      index === 'main'
        ? line.stat !== piece.main.stat
          ? {
              stat: line.stat,
              value: String(
                MAIN_STATS[slot].find(({ stat }) => stat === line.stat)
                  ?.value ?? line.value
              ),
            }
          : line
        : piece.main;
    const subs =
      index === 'main'
        ? piece.subs
        : piece.subs.map((sub, subIndex) => (subIndex === index ? line : sub));
    onArtifactsChange({
      ...artifacts,
      pieces: { ...artifacts.pieces, [slot]: { main, subs } },
    });
  };

  const summary = formatScreenTotals(
    character,
    computeScreenStats(character, parseValues(values), artifacts)
  );

  return (
    <div data-testid='artifact-editor' className='mt-4 border-t pt-3'>
      <div className='flex items-center gap-2'>
        <Checkbox
          id={toggleId}
          data-testid='artifact-editor-toggle'
          checked={artifacts.enabled}
          onCheckedChange={handleToggle}
        />
        <Label htmlFor={toggleId}>
          Calculate the stats from the artifacts (instead of typing the totals)
        </Label>
      </div>
      {artifacts.enabled && (
        <>
          <div className='mt-3 flex flex-col gap-3'>
            {ARTIFACT_SLOTS.map((slot) => {
              const piece = artifacts.pieces[slot];
              const icon = icons.get(slot);
              return (
                <div
                  key={slot}
                  data-testid={`artifact-editor-${slot}`}
                  className='flex gap-2'
                >
                  {icon && (
                    <ItemIcon
                      src={relicIconUrl(icon)}
                      alt={`${character.artifactSet.name} ${SLOT_LABELS[slot]}`}
                      size={44}
                    />
                  )}
                  <div className='flex min-w-0 flex-col gap-1'>
                    <span className='text-xs font-semibold'>
                      {SLOT_LABELS[slot]}
                    </span>
                    <LineEditor
                      character={character}
                      line={piece.main}
                      options={MAIN_STATS[slot].map(({ stat }) => stat)}
                      allowEmpty={false}
                      label={`${SLOT_LABELS[slot]} main`}
                      onChange={(line) => updateLine(slot, 'main', line)}
                    />
                    <div className='grid grid-cols-2 gap-1'>
                      {piece.subs.map((sub, index) => (
                        <LineEditor
                          // Substat slots are fixed: their place is the key.

                          key={index}
                          character={character}
                          line={sub}
                          options={SUBSTATS}
                          allowEmpty
                          compact
                          label={`${SLOT_LABELS[slot]} substat ${index + 1}`}
                          onChange={(line) => updateLine(slot, index, line)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <dl
            data-testid='artifact-editor-totals'
            className='mt-3 grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-md bg-muted/50 p-2 text-xs'
          >
            {summary.map(({ label, value }) => (
              <div key={label} className='flex justify-between gap-2'>
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='font-semibold tabular-nums'>{value}</dd>
              </div>
            ))}
          </dl>
          <p className='mt-1 text-xs text-muted-foreground'>
            Character screen totals: base stats, ascension (
            {statLabel(character, character.ascensionStat.stat)}{' '}
            {formatNumber(character.ascensionStat.value)}), the weapon and the
            pieces. Conditional bonuses still come from the kit.
          </p>
        </>
      )}
    </div>
  );
};

export default ArtifactEditor;
