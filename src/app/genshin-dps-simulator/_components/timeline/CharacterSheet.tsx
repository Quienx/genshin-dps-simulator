import { Play, RotateCcw, Star } from 'lucide-react';
import { ReactNode, useState } from 'react';

import { cn } from '@/lib/utils';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { NumberField } from '@/components/ui/number-field';
import { Inset } from '@/components/ui/panel';
import { SectionLabel } from '@/components/ui/section-label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StatList, StatRow } from '@/components/ui/stat-row';
import { toggleVariants } from '@/components/ui/toggle-group';

import SectionHelp from './SectionHelp';
import { SectionHelpKey } from './sectionHelp';
import StatIcon from './StatIcon';
import TalentLevelSelect from '../TalentLevelSelect';
import SkillCooldownIcon from '../team/SkillCooldownIcon';
import { getBurstCharge, getRunOptionFields } from '../../_lib/burstCharge';
import { CatalogOption } from '../../_lib/catalog';
import {
  getFileGear,
  getGearOptions,
  getLoadedVariant,
} from '../../_lib/characterData';
import { CHARACTERS } from '../../_lib/characters';
import formatNumber from '../../_lib/formatNumber';
import { elementIconUrl, iconUrl, relicIconUrl } from '../../_lib/genshinIcons';
import { readFlag, readNumber } from '../../_lib/readValue';
import {
  clampNumberField,
  getFieldsBySection,
  numberFieldError,
} from '../../_lib/simulationFields';
import {
  parseValues,
  withFlag,
  withGear,
  withNumber,
  withRefinement,
} from '../../_lib/simulationValues';
import {
  clampBaseTalentLevel,
  MAX_BASE_TALENT_LEVEL,
} from '../../_lib/talents';
import { CooldownState } from '../../_lib/team';
import {
  CharacterId,
  NumberFieldDefinition,
  SimulationValues,
} from '../../_lib/types';
import { getWeaponRefinement, isWeaponEquipped } from '../../_lib/weapons';

const MAX_REFINEMENT = 5;

// A weapon's or ascension's stat names.
const STAT_NAMES: Record<string, string> = {
  critRate: 'CRIT Rate',
  critDamage: 'CRIT DMG',
  atkPercent: 'ATK%',
  hpPercent: 'HP%',
  defPercent: 'DEF%',
  energyRecharge: 'Energy Recharge',
  elementalMastery: 'Elemental Mastery',
  elementalDmg: 'Elemental DMG',
  physicalDmg: 'Physical DMG',
};
const PERCENT_STATS = new Set([
  'critRate',
  'critDamage',
  'atkPercent',
  'hpPercent',
  'defPercent',
  'energyRecharge',
  'elementalDmg',
  'physicalDmg',
]);

// Each stat field's icon: the character screen's own (StatIcon), or the
// element's icon for its DMG Bonus; the room is kept when there is none.
const FieldIcon = ({ field, element }: { field: string; element: string }) => {
  const elementIcon =
    field === 'elementalBonus' ? elementIconUrl(element) : null;
  if (elementIcon) {
    return (
      <Avatar
        src={elementIcon}
        size={16}
        className='bg-transparent opacity-60'
      />
    );
  }
  return (
    <span className='size-4 shrink-0'>
      <StatIcon
        field={field}
        className='size-4 text-muted-foreground opacity-50'
      />
    </span>
  );
};

const statValue = (stat: string, value: number) =>
  `${formatNumber(value)}${PERCENT_STATS.has(stat) ? '%' : ''}`;

const Section = ({
  title,
  help,
  children,
}: {
  title: string;
  // Its "?" tooltip.
  help?: SectionHelpKey;
  children: ReactNode;
}) => (
  <Inset className='p-3'>
    <SectionLabel as='h3' className='mb-2 flex items-center gap-1.5'>
      {title}
      {help && <SectionHelp section={help} />}
    </SectionLabel>
    {children}
  </Inset>
);

// A small number box for the sheet's rows.
// A number field: red with the reason while its value is not valid (out
// of range, not a number); leaving it snaps it to the nearest valid value.
const NumberBox = ({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) => {
  const error = disabled ? null : numberFieldError(value, { min, max, step });
  return (
    // Looks like plain text: no box, no spinner; a faint line on hover and
    // a blue one while editing tell it can be changed.
    <NumberField
      variant='inline'
      aria-label={label}
      error={error}
      data-error-testid='timeline-field-error'
      value={value}
      min={min}
      max={max}
      step={step ?? 'any'}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onCommit={() => {
        const valid = clampNumberField(value, { min, max, step });
        if (valid !== value) {
          onChange(valid);
        }
      }}
      className='w-20'
    />
  );
};

const Stars = ({ count }: { count: number }) => (
  <span className='flex' aria-label={`${count} stars`}>
    {Array.from({ length: count }, (_, index) => (
      <Star key={index} className='size-3 fill-amber-400 text-amber-400' />
    ))}
  </span>
);

// Picks a catalog weapon or set for the build.
const GearSelect = ({
  label,
  testId,
  value,
  options,
  iconOf,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  options: CatalogOption[];
  iconOf: (icon: string) => string;
  onChange: (id: string) => void;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger
      aria-label={label}
      data-testid={testId}
      size='sm'
      className='mb-2'
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem
          key={option.id}
          value={option.id}
          data-testid={`${testId}-${option.id}`}
        >
          <Avatar src={iconOf(option.icon)} size={18} className='rounded' />
          {option.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

// The Q's icon in the run options: never on cooldown there.
const READY: CooldownState = {
  ready: 1,
  charges: 1,
  remaining: 0,
  recharging: 0,
  max: 0,
};

type CharacterSheetProps = {
  // The member's build; null closes the sheet.
  build: SimulationValues | null;
  onClose: () => void;
  // Saves the edited build (the page runs the simulation again with it).
  onSave: (build: SimulationValues) => void;
};

// A member's build, as the run used it, and editable: the character
// screen's stats, talent levels, constellations and weapon refinement.
// Edits are a draft until "Save & simulate".
const CharacterSheet = ({ build, onClose, onSave }: CharacterSheetProps) => {
  const [draft, setDraft] = useState<SimulationValues | null>(build);
  // The draft's gear: another catalog weapon or set than the file's.
  const loaded = draft
    ? getLoadedVariant(draft.character, {
        weapon: draft.weapon,
        artifactSet: draft.artifactSet,
      })
    : null;
  const fileGear = draft ? getFileGear(draft.character) : null;
  const gearOptions = draft ? getGearOptions(draft.character) : null;
  const character = loaded?.character;
  const values = draft ? parseValues(draft) : null;
  const dirty =
    draft !== null &&
    build !== null &&
    JSON.stringify(draft) !== JSON.stringify(build);
  // With the five artifacts entered, the stats are computed from them.
  const computed = draft?.artifacts?.enabled === true;
  const statFields = draft
    ? (getFieldsBySection(
        CHARACTERS[draft.character as CharacterId],
        'stats'
      ).filter((field) => field.kind === 'number') as NumberFieldDefinition[])
    : [];
  // How the run starts: for now only what the Q starts with.
  const runFields =
    draft && character
      ? getRunOptionFields(
          CHARACTERS[draft.character as CharacterId],
          character
        )
      : [];
  const burstCharge = character ? getBurstCharge(character) : null;
  const burstIcon =
    character?.talents.find((talent) => talent.kind === 'burst')?.icon ?? null;
  const setNumber = (name: string, value: string) =>
    setDraft((current) => current && withNumber(current, name, value));
  // Constellations go in order: picking Cn turns on C1 to Cn and off
  // everything above; picking the highest one on turns it off.
  const pickConstellation = (level: number) =>
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const parsed = parseValues(current);
      const highest = [1, 2, 3, 4, 5, 6].filter((n) =>
        readFlag(parsed, `c${n}`)
      ).length;
      const count = highest === level ? level - 1 : level;
      return [1, 2, 3, 4, 5, 6].reduce(
        (values, n) => withFlag(values, `c${n}`, n <= count),
        current
      );
    });
  const refinement =
    character && values ? getWeaponRefinement(character.weapon, values) : 1;
  // A field in red (out of range, not a number) blocks saving.
  const invalid =
    (draft !== null &&
      [
        ...(computed ? [] : statFields),
        ...runFields.filter(
          (field): field is NumberFieldDefinition => field.kind === 'number'
        ),
      ].some(
        (field) =>
          numberFieldError(draft.numbers[field.name] ?? '', field) !== null
      )) ||
    (draft !== null &&
      character !== undefined &&
      numberFieldError(draft.numbers[character.weapon.refinementField] ?? '', {
        min: 1,
        max: MAX_REFINEMENT,
        step: 1,
      }) !== null);

  return (
    <Sheet open={build !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        data-testid='timeline-character-sheet'
        className='w-full gap-0 overflow-y-auto border-border bg-card text-foreground sm:max-w-sm'
        // Opening focuses the close button, not the first section's help
        // (a focused help opens its tooltip and keeps it open).
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement)
            .querySelector<HTMLElement>('[data-testid="sheet-close"]')
            ?.focus();
        }}
      >
        {character && values && draft && (
          <>
            <SheetHeader className='flex-row items-center gap-3 border-b border-border'>
              <Avatar
                src={iconUrl(character.icons.avatar)}
                size={56}
                ring
                className='rounded-xl'
              />
              <div className='min-w-0'>
                <SheetTitle className='flex items-center gap-1.5 text-foreground'>
                  {character.name}
                  {elementIconUrl(character.element) && (
                    <Avatar
                      src={elementIconUrl(character.element) ?? ''}
                      alt={character.element}
                      size={18}
                      tile={false}
                    />
                  )}
                </SheetTitle>
                <SheetDescription className='flex items-center gap-2 text-xs text-subtle'>
                  <Stars count={character.rarity} />
                  Lv. 90 · {character.weaponType}
                </SheetDescription>
              </div>
            </SheetHeader>

            <div className='flex flex-col gap-3 p-4'>
              <Section title='Character screen stats' help='screenStats'>
                <StatList>
                  {statFields.map((field) => (
                    <StatRow
                      key={field.name}
                      icon={
                        <FieldIcon
                          field={field.name}
                          element={character.element}
                        />
                      }
                      label={field.label}
                      value={
                        computed ? (
                          formatNumber(readNumber(values, field.name))
                        ) : (
                          <NumberBox
                            label={field.label}
                            value={draft.numbers[field.name] ?? ''}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            onChange={(value) => setNumber(field.name, value)}
                          />
                        )
                      }
                      className='items-center'
                      labelClassName='min-w-0'
                    />
                  ))}
                </StatList>
                <p className='mt-1.5 text-2xs text-subtle'>
                  {computed
                    ? 'Computed from the five artifacts entered (edit them in the team screen).'
                    : 'The character screen totals.'}{' '}
                  Ascension:{' '}
                  {STAT_NAMES[character.ascensionStat.stat] ??
                    character.ascensionStat.stat}{' '}
                  +
                  {statValue(
                    character.ascensionStat.stat,
                    character.ascensionStat.value
                  )}
                  .
                </p>
              </Section>

              <Section title='Talents' help='talents'>
                <StatList>
                  {character.talents.map((talent) => {
                    const boosted =
                      typeof talent.boostedBy === 'string' &&
                      readFlag(values, talent.boostedBy);
                    return (
                      <StatRow
                        key={talent.id}
                        icon={
                          <Avatar
                            src={iconUrl(talent.icon)}
                            size={18}
                            shape='circle'
                          />
                        }
                        label={<span className='truncate'>{talent.name}</span>}
                        className='items-center'
                        labelClassName='min-w-0'
                        value={
                          <span className='flex items-center gap-1.5'>
                            {/* Its room is always kept, so every
                              dropdown lines up. */}
                            <span
                              className={cn(
                                'w-10 text-right text-2xs text-brand-300',
                                !boosted && 'invisible'
                              )}
                            >
                              +3 (C)
                            </span>
                            <TalentLevelSelect
                              className='w-20'
                              data-testid={`timeline-talent-${talent.id}`}
                              label={`${talent.name} level`}
                              level={clampBaseTalentLevel(
                                readNumber(values, talent.levelField)
                              )}
                              maxLevel={MAX_BASE_TALENT_LEVEL}
                              onLevelChange={(value) =>
                                setNumber(talent.levelField, value)
                              }
                            />
                          </span>
                        }
                      />
                    );
                  })}
                </StatList>
              </Section>

              {runFields.length > 0 && (
                <Section title='Run options' help='runOptions'>
                  {runFields.map((field) =>
                    field.kind === 'number' ? (
                      <StatRow
                        key={field.name}
                        className='items-center py-0.5'
                        labelClassName='min-w-0'
                        icon={
                          <SkillCooldownIcon
                            icon={burstIcon}
                            label='Q'
                            cooldown={READY}
                            element={character.element}
                            // Its ring fills with what is typed in, up to
                            // what the Q needs (Energy, Fighting Spirit).
                            energy={{
                              value: Number(draft.numbers[field.name] ?? 0),
                              max: burstCharge?.needed ?? field.max ?? 0,
                            }}
                            size={24}
                          />
                        }
                        label={<span className='truncate'>{field.label}</span>}
                        value={
                          <NumberBox
                            label={field.label}
                            value={draft.numbers[field.name] ?? ''}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            onChange={(value) => setNumber(field.name, value)}
                          />
                        }
                      />
                    ) : (
                      <label
                        key={field.name}
                        data-testid={`timeline-sheet-option-${field.name}`}
                        className='flex cursor-pointer items-start gap-2 py-1 text-xs text-muted-foreground'
                      >
                        <input
                          type='checkbox'
                          checked={readFlag(values, field.name)}
                          onChange={(event) =>
                            setDraft(
                              (current) =>
                                current &&
                                withFlag(
                                  current,
                                  field.name,
                                  event.target.checked
                                )
                            )
                          }
                          className='mt-0.5 size-3.5 shrink-0 accent-brand-500'
                        />
                        {field.label}
                      </label>
                    )
                  )}
                </Section>
              )}
              <Section title='Constellations' help='constellations'>
                <div className='grid grid-cols-6 gap-1.5'>
                  {character.constellations.map((entry) => {
                    const flag = `c${entry.level}`;
                    const active = readFlag(values, flag);
                    return (
                      <button
                        type='button'
                        key={entry.level}
                        data-state={active ? 'on' : 'off'}
                        aria-pressed={active}
                        title={`C${entry.level}: ${entry.name}${
                          entry.description ? `\n\n${entry.description}` : ''
                        }`}
                        onClick={() => pickConstellation(entry.level)}
                        // A toggle's look, in a column: the icon over its
                        // level.
                        className={cn(
                          toggleVariants({ size: null }),
                          'flex-col gap-0.5 p-1 text-2xs',
                          !active && 'text-subtle opacity-60'
                        )}
                      >
                        <Avatar
                          src={iconUrl(entry.icon)}
                          size={24}
                          className={cn(
                            'bg-transparent',
                            !active && 'grayscale'
                          )}
                        />
                        C{entry.level}
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title='Weapon' help='weapon'>
                {gearOptions && gearOptions.weapons.length > 1 && (
                  <GearSelect
                    label='Weapon'
                    testId='timeline-weapon-select'
                    value={draft.weapon ?? fileGear?.weapon ?? ''}
                    options={gearOptions.weapons}
                    iconOf={iconUrl}
                    onChange={(weapon) =>
                      setDraft(
                        (current) => current && withGear(current, { weapon })
                      )
                    }
                  />
                )}
                <div className='mb-2 flex items-center gap-2.5'>
                  <Avatar
                    src={iconUrl(character.weapon.icon)}
                    size={44}
                    className={cn(
                      'rounded-lg bg-linear-to-br from-amber-700 to-orange-400 ring-1 ring-amber-300/30',
                      !isWeaponEquipped(character.weapon, values) &&
                        'opacity-40 grayscale'
                    )}
                  />
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-medium text-foreground'>
                      {character.weapon.name}
                    </p>
                    <p className='flex items-center gap-1.5 text-2xs text-subtle'>
                      <Stars count={character.weapon.rarity} />
                      Lv. {character.weapon.level}
                    </p>
                  </div>
                </div>
                <StatList>
                  <StatRow
                    label='Refinement'
                    value={
                      <NumberBox
                        label='Refinement'
                        value={
                          draft.numbers[character.weapon.refinementField] ?? ''
                        }
                        min={1}
                        max={MAX_REFINEMENT}
                        step={1}
                        onChange={(value) =>
                          setDraft(
                            (current) =>
                              current && withRefinement(current, value)
                          )
                        }
                      />
                    }
                  />
                  <StatRow
                    label='Base ATK'
                    value={formatNumber(character.weapon.baseAtk)}
                  />
                  <StatRow
                    label={
                      STAT_NAMES[character.weapon.substat.stat] ??
                      character.weapon.substat.stat
                    }
                    value={statValue(
                      character.weapon.substat.stat,
                      character.weapon.substat.value
                    )}
                  />
                </StatList>
                {character.weapon.passive && (
                  <div className='mt-2 border-t border-muted pt-2 text-xs'>
                    <p className='font-medium text-muted-foreground'>
                      {character.weapon.passive.name}{' '}
                      <span className='text-2xs font-normal text-subtle'>
                        R{refinement}
                        {isWeaponEquipped(character.weapon, values)
                          ? ''
                          : ' · off'}
                      </span>
                    </p>
                    <p className='mt-0.5 text-2xs leading-relaxed whitespace-pre-line text-subtle'>
                      {
                        character.weapon.passive.descriptions[
                          Math.min(
                            refinement,
                            character.weapon.passive.descriptions.length
                          ) - 1
                        ]
                      }
                    </p>
                  </div>
                )}
              </Section>

              <Section title='Artifacts' help='artifacts'>
                {gearOptions && gearOptions.sets.length > 1 && (
                  <GearSelect
                    label='Artifact set'
                    testId='timeline-set-select'
                    value={draft.artifactSet ?? fileGear?.artifactSet ?? ''}
                    options={gearOptions.sets}
                    iconOf={relicIconUrl}
                    onChange={(artifactSet) =>
                      setDraft(
                        (current) =>
                          current && withGear(current, { artifactSet })
                      )
                    }
                  />
                )}
                <div className='mb-2 flex items-center gap-2'>
                  {character.artifactSet.pieces.slice(0, 1).map((piece) => (
                    <Avatar
                      key={piece.icon}
                      src={relicIconUrl(piece.icon)}
                      size={36}
                    />
                  ))}
                  <p className='text-sm font-medium text-foreground'>
                    {character.artifactSet.name}
                  </p>
                </div>
                {character.artifactSet.rows.map((row) => {
                  const { flag } = row;
                  const on = !flag || readFlag(values, flag);
                  return (
                    <div key={row.label} className='py-1 text-xs'>
                      {/* A set bonus with a flag turns on and off. */}
                      <button
                        type='button'
                        disabled={!flag}
                        aria-pressed={on}
                        data-testid={
                          flag ? `timeline-set-flag-${flag}` : undefined
                        }
                        onClick={() =>
                          flag &&
                          setDraft(
                            (current) => current && withFlag(current, flag, !on)
                          )
                        }
                        className={cn(
                          'font-medium enabled:hover:underline',
                          on ? 'text-emerald-300' : 'text-subtle'
                        )}
                      >
                        {row.label} {on ? '' : '(off)'}
                      </button>
                      <p className='text-2xs leading-relaxed text-subtle'>
                        {row.value}
                      </p>
                    </div>
                  );
                })}
              </Section>
            </div>

            {/* Save runs the simulation again with this build. */}
            <div className='sticky bottom-0 mt-auto flex items-center gap-2 border-t border-border bg-card p-3'>
              <Button
                variant='outline'
                size='sm'
                disabled={!dirty}
                onClick={() => setDraft(build)}
              >
                <RotateCcw />
                Reset
              </Button>
              <Button
                size='sm'
                data-testid='timeline-character-save'
                disabled={!dirty || invalid}
                title={invalid ? 'Fix the fields in red first' : undefined}
                onClick={() => onSave(draft)}
                // Hovered while disabled, it still says why.
                className='ml-auto'
              >
                <Play />
                Save &amp; simulate
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default CharacterSheet;
