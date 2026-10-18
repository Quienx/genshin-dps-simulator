'use client';

import {
  DndContext,
  DragOverlay,
  Modifier,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Pencil, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import CharacterSheet from './CharacterSheet';
import CombatLog from './CombatLog';
import DamageSummary from './DamageSummary';
import EnemyPanel from './EnemyPanel';
import EventPanel from './EventPanel';
import { buildMemberColors, MemberColor } from './memberColors';
import PanelToggle from './PanelToggle';
import { payloadOf } from './rotationDnd';
import RotationEditBar from './RotationEditBar';
import { buildRuler, fitPxPerSecond } from './ruler';
import {
  loadSavedRotations,
  SavedRotation,
  storeSavedRotations,
} from './savedRotations';
import SectionHelp from './SectionHelp';
import { SourceLegend } from './sourceStyles';
import TimelineChart, { TimelineMember } from './TimelineChart';
import { applyDrop, DragPayload, groupNormalCombos } from './timelineData';
import TimelineHeader, { TimelineScenario } from './TimelineHeader';
import usePlayback from './usePlayback';
import RotationActionIcon from '../rotation/RotationActionIcon';
import {
  getLoadedCharacter,
  getLoadedVariant,
  showBuilds,
} from '../../_lib/characterData';
import { CHARACTER_LIST } from '../../_lib/characters';
import { iconUrl } from '../../_lib/genshinIcons';
import { buildInspectorView } from '../../_lib/inspector';
import { readNumber } from '../../_lib/readValue';
import { removeBlocks, selectRange } from '../../_lib/rotation/blocks';
import { RotationSetting } from '../../_lib/rotation/types';
import { parseValues } from '../../_lib/simulationValues';
import {
  buildDefaultTeam,
  buildMemberValues,
  buildPresetRotation,
  buildPresetTeam,
  buildRotationFromRun,
  DEFAULT_SWAP_DELAY_FRAMES,
  getTeamActions,
  INSPECTOR_TEST_IDS,
  MAVUIKA_PRESETS,
  runInspectorTest,
  runOwnRotation,
  runSolo,
  runTeam,
  TEAM_PRESET_ROTATION,
  TeamRun,
  TeamState,
} from '../../_lib/team';
import { SimulationValues } from '../../_lib/types';
import { getWeaponRefinement } from '../../_lib/weapons';

const ZOOM_STEP = 1.25;
// Edit mode: empty seconds after the run, room to drop new blocks in.
const EDIT_ROOM_SECONDS = 10;
// Wide enough to read every action: the timeline scrolls, as in a video
// editor.
const DEFAULT_PX_PER_SECOND = 60;
const MIN_PX_PER_SECOND = 1;
const MAX_PX_PER_SECOND = 400;

// `version` counts the runs (an open build sheet starts over on each).
type ScenarioRun = {
  members: SimulationValues[];
  run: TeamRun;
  version: number;
};

type Scenario = TimelineScenario & {
  // Its members' default builds, and its run with any builds.
  defaults: () => SimulationValues[];
  run: (members: SimulationValues[]) => TeamRun;
  // How its run plays, for a rotation of one's own (edit mode).
  setup: Pick<TeamState, 'fillWhileWaiting' | 'swapDelayFrames' | 'auras'>;
};

// Edit mode: the dragged block's chip rides above the pointer.
const liftOverlay: Modifier = ({ transform }) => ({
  ...transform,
  y: transform.y - 34,
});

// A rotation of one's own, and how it plays.
type OwnSetup = Omit<TeamState, 'members'>;

const TEAM_SETUP: Scenario['setup'] = {
  fillWhileWaiting: false,
  swapDelayFrames: DEFAULT_SWAP_DELAY_FRAMES,
  auras: true,
};

// What the timeline can show, each with default builds:
// - teams: the Team rotation card's run (the default), Varesa, Iansan,
//   Chevreuse and Nicole with its preset rotation, as "Simulate team" runs
//   it; and the team screen's inspector test (Chevreuse + Iansan);
// - every character alone, as on its own screen (its automatic rotation).
const SCENARIOS: Scenario[] = [
  {
    id: 'team',
    label: 'Varesa team rotation',
    group: 'team',
    avatars: buildDefaultTeam().members.map((values) => values.character),
    defaults: () => buildDefaultTeam().members,
    run: (members) => runTeam({ ...buildDefaultTeam(), members }, 'random'),
    setup: TEAM_SETUP,
  },
  ...MAVUIKA_PRESETS.map(
    (preset): Scenario => ({
      id: preset.id,
      label: preset.label,
      group: 'team',
      avatars: preset.members,
      defaults: () => buildPresetTeam(preset).members,
      run: (members) =>
        runTeam({ ...buildPresetTeam(preset), members }, 'random'),
      setup: TEAM_SETUP,
    })
  ),
  {
    id: 'inspector',
    label: 'Chevreuse + Iansan test',
    group: 'team',
    avatars: INSPECTOR_TEST_IDS,
    defaults: () => INSPECTOR_TEST_IDS.map(buildMemberValues),
    run: runInspectorTest,
    setup: TEAM_SETUP,
  },
  ...CHARACTER_LIST.map(
    (character): Scenario => ({
      id: `solo:${character.id}`,
      label: character.name,
      group: 'solo',
      avatars: [character.id],
      defaults: () => [buildMemberValues(character.id)],
      run: ([values]) => runSolo(values, 'random'),
      // As runSolo plays it.
      setup: { fillWhileWaiting: false, swapDelayFrames: 0, auras: false },
    })
  ),
];

// A team of one's own, picked in the header (`custom:mavuika,iansan`): the
// preset rotation when every member has steps in it (part of Varesa's
// team), else the first member's automatic list; edit mode writes the rest.
const CUSTOM_PREFIX = 'custom:';
const CUSTOM_TEAM_MAX = 4;
const parseCustomTeam = (id: string): string[] | null => {
  if (!id.startsWith(CUSTOM_PREFIX)) {
    return null;
  }
  const ids = id.slice(CUSTOM_PREFIX.length).split(',');
  const known = new Set(CHARACTER_LIST.map((character) => character.id));
  return ids.length >= 1 &&
    ids.length <= CUSTOM_TEAM_MAX &&
    new Set(ids).size === ids.length &&
    ids.every((characterId) => known.has(characterId as never))
    ? ids
    : null;
};
const customScenario = (ids: string[]): Scenario => ({
  id: `${CUSTOM_PREFIX}${ids.join(',')}`,
  label: ids.map((id) => getLoadedCharacter(id).character.name).join(' + '),
  group: 'team',
  avatars: ids,
  defaults: () => ids.map(buildMemberValues),
  run: (members) => {
    const inPreset = ids.every((id) =>
      TEAM_PRESET_ROTATION.some(([characterId]) => characterId === id)
    );
    return runTeam(
      {
        members,
        rotation: inPreset ? buildPresetRotation(ids) : null,
        ...TEAM_SETUP,
      },
      'random'
    );
  },
  setup: TEAM_SETUP,
});
// The scenario for these members: one that has exactly them, else a team
// of one's own (a single character is its solo screen).
const scenarioIdFor = (ids: string[]): string =>
  ids.length === 1
    ? `solo:${ids[0]}`
    : SCENARIOS.find(
        (entry) =>
          entry.group === 'team' &&
          entry.avatars.length === ids.length &&
          entry.avatars.every((id, index) => id === ids[index])
      )?.id ?? `${CUSTOM_PREFIX}${ids.join(',')}`;

const scenarioOf = (id: string): Scenario => {
  const custom = parseCustomTeam(id);
  if (custom) {
    return customScenario(custom);
  }
  return SCENARIOS.find((entry) => entry.id === id) ?? SCENARIOS[0];
};

// The dropdown: every preset, and the team of one's own being shown.
const scenariosFor = (id: string): Scenario[] =>
  parseCustomTeam(id) ? [...SCENARIOS, scenarioOf(id)] : SCENARIOS;

// The scenario picked is kept in the URL (?team=solo:mavuika), so a reload
// or a shared link opens it again.
const SCENARIO_PARAM = 'team';
const readUrlScenario = (): string => {
  const id = new URLSearchParams(window.location.search).get(SCENARIO_PARAM);
  return id &&
    (SCENARIOS.some((entry) => entry.id === id) || parseCustomTeam(id))
    ? id
    : SCENARIOS[0].id;
};
const writeUrlScenario = (id: string) => {
  const url = new URL(window.location.href);
  if (id === SCENARIOS[0].id) {
    url.searchParams.delete(SCENARIO_PARAM);
  } else {
    url.searchParams.set(SCENARIO_PARAM, id);
  }
  window.history.replaceState(window.history.state, '', url);
};

// The actions a scenario's members have now (a saved rotation is checked
// against them).
const scenarioActions = (id: string) =>
  new Set(
    getTeamActions(
      scenarioOf(id)
        .defaults()
        .map((values) => values.character)
    ).map((action) => action.id)
  );

// The new inspector: the party and the player on top, the run's timeline
// below. CRITs are rolled, so the run is made in the browser only (the
// server's would not match it).
const CombatTimelinePage = () => {
  const [scenario, setScenario] = useState(SCENARIOS[0].id);
  const [state, setState] = useState<ScenarioRun | null>(null);
  // Edit mode: a rotation of one's own (null: the scenario's).
  const [editing, setEditing] = useState(false);
  const [own, setOwn] = useState<OwnSetup | null>(null);
  // Each run rolls the CRITs again; without builds, with the defaults.
  // (Run outside the state update, so it runs once.)
  const version = useRef(0);
  const simulate = useCallback(
    (
      id: string,
      members?: SimulationValues[],
      ownSetup: OwnSetup | null = null
    ) => {
      const builds = members ?? scenarioOf(id).defaults();
      // What the inspector and team snapshots read: each build's gear.
      showBuilds(builds);
      version.current += 1;
      setState({
        members: builds,
        run: ownSetup
          ? runOwnRotation({ ...ownSetup, members: builds }, 'random')
          : scenarioOf(id).run(builds),
        version: version.current,
      });
    },
    []
  );
  // Edited rotations, per scenario, kept in this browser across reloads.
  const saved = useRef<Record<string, SavedRotation>>({});
  const keep = (id: string, next: OwnSetup | null) => {
    const rest = { ...saved.current };
    delete rest[id];
    saved.current = next ? { ...rest, [id]: next } : rest;
    storeSavedRotations(saved.current);
  };
  useEffect(() => {
    saved.current = loadSavedRotations(scenarioActions);
    const initial = readUrlScenario();
    const restored = saved.current[initial] ?? null;
    setScenario(initial);
    setOwn(restored);
    simulate(initial, undefined, restored);
  }, [simulate]);
  const handleScenarioChange = useCallback(
    (id: string) => {
      const restored = saved.current[id] ?? null;
      writeUrlScenario(id);
      setScenario(id);
      setEditing(false);
      setOwn(restored);
      simulate(id, undefined, restored);
    },
    [simulate]
  );
  if (!state) {
    return (
      <main className='min-h-screen bg-[#070b14] p-4 text-sm text-slate-400'>
        Simulating…
      </main>
    );
  }
  const change = (patch: Partial<OwnSetup>) => {
    if (!own) {
      return;
    }
    const next = { ...own, ...patch };
    setOwn(next);
    keep(scenario, next);
    simulate(scenario, state.members, next);
  };
  return (
    <CombatTimeline
      builds={state.members}
      run={state.run}
      scenario={scenario}
      onScenarioChange={handleScenarioChange}
      onTeamChange={(ids) => handleScenarioChange(scenarioIdFor(ids))}
      version={state.version}
      edit={
        editing && own
          ? {
              rotation: own.rotation,
              onChange: (rotation) => change({ rotation }),
            }
          : null
      }
      editing={editing}
      // Back to the scenario's own rotation (the saved one is dropped).
      onResetRotation={
        own
          ? () => {
              keep(scenario, null);
              setOwn(null);
              setEditing(false);
              simulate(scenario, state.members, null);
            }
          : undefined
      }
      onEditToggle={() => {
        if (!editing && !own) {
          // What the chart shows, as blocks: each combo one block. Run
          // with them at once, so each block on the chart is one of them.
          const next = {
            ...scenarioOf(scenario).setup,
            rotation: buildRotationFromRun(state.run),
          };
          setOwn(next);
          simulate(scenario, state.members, next);
        }
        setEditing(!editing);
      }}
      // Again with the same builds (edited ones stay).
      onSimulate={() => simulate(scenario, state.members, own)}
      onSaveBuild={(build) =>
        simulate(
          scenario,
          state.members.map((values) =>
            values.character === build.character ? build : values
          ),
          own
        )
      }
    />
  );
};

const CombatTimeline = ({
  builds,
  run,
  scenario,
  onScenarioChange,
  onTeamChange,
  onSimulate,
  version,
  onSaveBuild,
  edit,
  editing,
  onEditToggle,
  onResetRotation,
}: {
  builds: SimulationValues[];
  run: TeamRun;
  scenario: string;
  onScenarioChange: (id: string) => void;
  // A party picked in the header (its members' ids, in order).
  onTeamChange: (ids: string[]) => void;
  onSimulate: () => void;
  version: number;
  onSaveBuild: (build: SimulationValues) => void;
  // Edit mode: the rotation on the chart, and changing it.
  edit: {
    rotation: RotationSetting;
    onChange: (rotation: RotationSetting) => void;
  } | null;
  editing: boolean;
  onEditToggle: () => void;
  onResetRotation?: () => void;
}) => {
  const view = useMemo(() => {
    showBuilds(builds);
    return buildInspectorView(
      run,
      Object.fromEntries(
        builds.map((values) => [
          values.character,
          getWeaponRefinement(
            getLoadedVariant(values.character, {
              weapon: values.weapon,
              artifactSet: values.artifactSet,
            }).character.weapon,
            parseValues(values)
          ),
        ])
      )
    );
  }, [run, builds]);
  const actionsById = useMemo(
    () =>
      new Map(
        getTeamActions(run.members.map((member) => member.characterId)).map(
          (action) => [action.id, action]
        )
      ),
    [run]
  );
  const members: TimelineMember[] = useMemo(() => {
    // Each member's own color, from their element (shades when it repeats).
    const colors = buildMemberColors(
      run.members.map((member) => ({
        characterId: member.characterId,
        element: getLoadedCharacter(member.characterId).character.element,
      }))
    );
    return run.members.map((member, slot) => ({
      characterId: member.characterId,
      name: member.name,
      avatar: iconUrl(
        getLoadedCharacter(member.characterId).character.icons.avatar
      ),
      slot,
      color: colors.get(member.characterId) as MemberColor,
    }));
  }, [run]);

  // The enemy's HP and level (the build's enemy settings).
  const enemy = useMemo(() => {
    const parsed = parseValues(builds[0]);
    return {
      hp: readNumber(parsed, 'enemyHp'),
      level: readNumber(parsed, 'enemyLevel'),
    };
  }, [builds]);

  // The member whose build is open (clicked in the top bar).
  const [openMember, setOpenMember] = useState<string | null>(null);

  // Minimized panels: the others take their room.
  const [panels, setPanels] = useState({
    chart: false,
    log: false,
    event: false,
    enemy: false,
  });
  const togglePanel = (panel: keyof typeof panels) =>
    setPanels((current) => ({ ...current, [panel]: !current[panel] }));

  const playback = usePlayback(view.duration, view.stepTimes);
  // A new run starts from the beginning; one from an edit (edit mode)
  // keeps the playhead, and the view, where they were.
  const { seek } = playback;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    if (!editingRef.current) {
      seek(0);
    }
  }, [run, seek]);

  // Zoom: pixels per second; Fit shows the whole run on screen.
  const [trackWidth, setTrackWidth] = useState(0);
  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND);
  // Each Normal Attack combo is one block (N1–N6); editing, each block is
  // one of the rotation's.
  const chartActions = useMemo(
    () => groupNormalCombos(view.actions, { byBlock: edit !== null }),
    [view, edit]
  );
  // The ruler spaces the blocks that take time; a skipped one (no time) is
  // a marker on top of where it was put.
  const timedActions = useMemo(
    () => chartActions.filter((action) => !action.skipped),
    [chartActions]
  );
  // The axis: the run (to its last block, past the counted 60 s if the
  // blocks go on), plus room to drop new blocks after them in edit mode.
  const axisSeconds = view.duration + (edit ? EDIT_ROOM_SECONDS : 0);
  // Edit mode: the blocks picked on the chart (the last one picked is the
  // one the edit bar and the Event panel show), and what is being dragged.
  const [picked, setPicked] = useState<string[]>([]);
  // Blocks that are gone (removed, a run rebuilt) drop out of it.
  const selection = useMemo(() => {
    const uids = new Set(edit?.rotation.blocks.map((block) => block.uid));
    return picked.filter((uid) => uids.has(uid));
  }, [picked, edit?.rotation.blocks]);
  const selectedBlock = selection[selection.length - 1] ?? null;
  const setSelectedBlock = (uid: string | null) => setPicked(uid ? [uid] : []);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  // The buff or debuff bar hovered on the chart (lit in the Event panel).
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  // A click right after a drag ends (the browser's, on release) is not a
  // pick: it would unpick the block just dropped.
  const dragEndedAt = useRef(0);
  // A click on a block picks only it; on the only one picked, unpicks it
  // (the Event panel follows the playhead again). Ctrl/Cmd adds or removes
  // it; Shift picks the range from the last one picked.
  const pickBlock = (
    blockUid: string,
    { range, toggle }: { range: boolean; toggle: boolean }
  ) => {
    if (performance.now() - dragEndedAt.current < 250 || !edit) {
      return;
    }
    if (range) {
      setPicked(selectRange(edit.rotation, selectedBlock, blockUid));
    } else if (toggle) {
      setPicked(
        selection.includes(blockUid)
          ? selection.filter((uid) => uid !== blockUid)
          : [...selection, blockUid]
      );
    } else {
      setPicked(
        selection.length === 1 && selection[0] === blockUid ? [] : [blockUid]
      );
    }
  };
  // A Shift + drag rectangle: the blocks it touches (with Ctrl/Cmd, added).
  const pickBlocks = (blockUids: string[], additive: boolean) =>
    setPicked(
      additive
        ? [...selection, ...blockUids.filter((uid) => !selection.includes(uid))]
        : blockUids
    );
  // Esc, Delete and Ctrl/Cmd + A on the chart.
  const selectionKey = (key: 'clear' | 'delete' | 'all') => {
    if (!edit) {
      return;
    }
    if (key === 'clear') {
      setPicked([]);
    } else if (key === 'all') {
      setPicked(edit.rotation.blocks.map((block) => block.uid));
    } else if (selection.length > 0) {
      edit.onChange(removeBlocks(edit.rotation, selection));
      setPicked([]);
    }
  };
  // A dragged block that is picked with others moves them all.
  const withSelection = (payload: DragPayload): DragPayload =>
    payload.kind === 'move' &&
    selection.length > 1 &&
    selection.includes(payload.blockUid)
      ? { ...payload, blockUids: selection }
      : payload;
  // A drag starts past 5 px, so a click still picks a block or adds one.
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const draggedAction = !dragging
    ? undefined
    : actionsById.get(
        dragging.kind === 'new'
          ? dragging.actionId
          : edit?.rotation.blocks.find(
              (block) => block.uid === dragging.blockUid
            )?.action ?? ''
      );
  const fitted = useMemo(
    () =>
      trackWidth > 0
        ? fitPxPerSecond(
            timedActions,
            axisSeconds,
            trackWidth - 16,
            MIN_PX_PER_SECOND,
            MAX_PX_PER_SECOND
          )
        : 16,
    [timedActions, axisSeconds, trackWidth]
  );
  // Every action at least as wide as its icon, so none overlap.
  const ruler = useMemo(
    () => buildRuler(timedActions, axisSeconds, pxPerSecond),
    [timedActions, axisSeconds, pxPerSecond]
  );
  const zoomBy = useCallback(
    (factor: number) =>
      setPxPerSecond((current) =>
        Math.min(
          MAX_PX_PER_SECOND,
          Math.max(MIN_PX_PER_SECOND, current * factor)
        )
      ),
    []
  );
  const handleTrackWidth = useCallback(
    (width: number) => setTrackWidth(width),
    []
  );

  return (
    // The page always fits the window (no page scroll): each panel scrolls
    // on its own. Narrow screens stack the panels and scroll.
    <main
      data-testid='combat-timeline'
      className='h-dvh overflow-auto bg-[#070b14] p-4 text-slate-100 lg:overflow-hidden'
    >
      <div className='flex flex-col gap-4 lg:h-full'>
        <TimelineHeader
          members={members}
          duration={view.duration}
          time={playback.time}
          playing={playback.playing}
          speed={playback.speed}
          onTogglePlay={playback.togglePlay}
          onStep={playback.stepTo}
          onSpeedChange={playback.setSpeed}
          onSeek={playback.seek}
          onZoom={(direction) =>
            zoomBy(direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP)
          }
          onFit={() => setPxPerSecond(fitted)}
          onSimulate={onSimulate}
          scenarios={scenariosFor(scenario)}
          scenario={scenario}
          onScenarioChange={onScenarioChange}
          onTeamChange={onTeamChange}
          onMemberClick={setOpenMember}
        />
        <div
          className={cn(
            'grid gap-4 lg:min-h-0 lg:flex-1',
            'lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]'
          )}
        >
          <div className='flex min-w-0 flex-col gap-4 lg:min-h-0'>
            <section
              data-testid='timeline-panel'
              className={cn(
                'flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950',
                panels.chart ? 'flex-none' : 'h-[60vh] lg:h-auto lg:flex-[2]'
              )}
            >
              <div
                className={cn(
                  'flex shrink-0 items-center justify-between bg-slate-900/70 px-3 py-1.5',
                  !panels.chart && 'border-b border-slate-700/60'
                )}
              >
                <h2 className='flex items-center gap-1.5 text-sm font-semibold text-slate-50'>
                  Timeline
                  <SectionHelp section='timeline' />
                </h2>
                {!panels.chart && (
                  <SourceLegend className='mr-auto ml-4 hidden md:flex' />
                )}
                {onResetRotation && (
                  <button
                    type='button'
                    data-testid='timeline-reset-rotation'
                    title='Drop your edits and go back to the scenario rotation'
                    onClick={onResetRotation}
                    className='mr-2 flex h-7 items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/60 px-2.5 text-[11px] font-medium text-slate-300 hover:bg-slate-700/70'
                  >
                    <RotateCcw className='size-3.5' />
                    Reset rotation
                  </button>
                )}
                <button
                  type='button'
                  data-testid='timeline-edit-rotation'
                  aria-pressed={editing}
                  onClick={onEditToggle}
                  className={cn(
                    'mr-2 flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium',
                    editing
                      ? 'border-sky-500/60 bg-sky-600 text-white hover:bg-sky-500'
                      : 'border-slate-700/60 bg-slate-800/60 text-slate-300 hover:bg-slate-700/70'
                  )}
                >
                  <Pencil className='size-3.5' />
                  {editing ? 'Done editing' : 'Edit rotation'}
                </button>
                <PanelToggle
                  label='timeline'
                  collapsed={panels.chart}
                  onToggle={() => togglePanel('chart')}
                />
              </div>
              {/* Edit mode's drag and drop: the palette and the chart's
                  blocks drag onto the chart's tracks or the trash. */}
              <DndContext
                sensors={dragSensors}
                collisionDetection={pointerWithin}
                onDragStart={(event) => {
                  const payload = payloadOf(event);
                  setDragging(payload && withSelection(payload));
                }}
                onDragEnd={() => {
                  dragEndedAt.current = performance.now();
                  setDragging(null);
                }}
                onDragCancel={() => {
                  dragEndedAt.current = performance.now();
                  setDragging(null);
                }}
              >
                {!panels.chart && edit && (
                  <RotationEditBar
                    members={members}
                    actions={Array.from(actionsById.values())}
                    rotation={edit.rotation}
                    selected={selectedBlock}
                    selection={selection}
                    onChange={edit.onChange}
                    onSelect={setSelectedBlock}
                    onClearSelection={() => setPicked([])}
                  />
                )}
                {!panels.chart && (
                  <div className='min-h-0 flex-1'>
                    <TimelineChart
                      view={view}
                      actions={chartActions}
                      members={members}
                      actionsById={actionsById}
                      time={playback.time}
                      ruler={ruler}
                      pxPerSecond={pxPerSecond}
                      onSeek={playback.seek}
                      onTogglePlay={playback.togglePlay}
                      onZoom={zoomBy}
                      onTrackWidthChange={handleTrackWidth}
                      selectedBlocks={edit ? selection : undefined}
                      onSelectBlock={edit ? pickBlock : undefined}
                      onSelectBlocks={edit ? pickBlocks : undefined}
                      onSelectionKey={edit ? selectionKey : undefined}
                      axisSeconds={axisSeconds}
                      onHoverChip={setHoveredChip}
                      memberRuns={run.members}
                      onDropBlock={
                        edit
                          ? (payload, beforeUid, rowMember) => {
                              const moved = withSelection(payload);
                              const result = applyDrop(
                                edit.rotation,
                                Array.from(actionsById.values()),
                                moved,
                                beforeUid,
                                rowMember
                              );
                              edit.onChange(result.rotation);
                              // A group stays picked, the dragged one last.
                              setPicked(
                                moved.kind === 'move' && moved.blockUids
                                  ? [
                                      ...moved.blockUids.filter(
                                        (uid) => uid !== moved.blockUid
                                      ),
                                      moved.blockUid,
                                    ]
                                  : result.selected
                                  ? [result.selected]
                                  : []
                              );
                            }
                          : undefined
                      }
                    />
                  </div>
                )}
                <DragOverlay
                  dropAnimation={null}
                  // Above the pointer, so the placeholder in the row (where
                  // it will land) stays in sight.
                  modifiers={[liftOverlay]}
                >
                  {draggedAction && (
                    <span className='flex h-7 items-center gap-1 rounded-md border border-sky-400 bg-slate-800 px-1.5 text-[11px] text-slate-100 shadow-lg'>
                      <RotationActionIcon
                        action={draggedAction}
                        size={18}
                        className='bg-transparent p-0 ring-0'
                      />
                      {draggedAction.shortLabel}
                      {dragging?.kind === 'move' &&
                        (dragging.blockUids?.length ?? 0) > 1 && (
                          <span
                            data-testid='timeline-drag-count'
                            className='ml-0.5 rounded bg-sky-600 px-1 text-[10px] font-semibold text-white'
                          >
                            +{(dragging.blockUids?.length ?? 1) - 1}
                          </span>
                        )}
                    </span>
                  )}
                </DragOverlay>
              </DndContext>
            </section>
            <div
              className={cn(
                'min-h-0',
                panels.log ? 'flex-none' : 'h-[40vh] lg:h-auto lg:flex-[1]'
              )}
            >
              <CombatLog
                view={view}
                members={members}
                actionsById={actionsById}
                time={playback.time}
                onSeek={playback.seek}
                collapsed={panels.log}
                onToggle={() => togglePanel('log')}
              />
            </div>
          </div>
          {/* Right: the damage so far, the selected event (it takes the
              room) and the enemy. */}
          <div className='flex min-w-0 flex-col gap-4 lg:min-h-0'>
            <DamageSummary view={view} time={playback.time} />
            <div
              className={cn(
                'min-h-0',
                panels.event ? 'flex-none' : 'h-[70vh] lg:h-auto lg:flex-1'
              )}
            >
              <EventPanel
                view={view}
                run={run}
                members={members}
                actionsById={actionsById}
                time={playback.time}
                enemyLevel={enemy.level}
                builds={builds}
                collapsed={panels.event}
                onToggle={() => togglePanel('event')}
                pickedBlock={edit ? selectedBlock : null}
                hoveredChip={hoveredChip}
                onSeek={playback.seek}
              />
            </div>
            <EnemyPanel
              view={view}
              time={playback.time}
              hp={enemy.hp}
              level={enemy.level}
              collapsed={panels.enemy}
              onToggle={() => togglePanel('enemy')}
            />
          </div>
        </div>
      </div>
      <CharacterSheet
        key={`${openMember ?? ''}:${version}`}
        onSave={onSaveBuild}
        build={builds.find((values) => values.character === openMember) ?? null}
        onClose={() => setOpenMember(null)}
      />
    </main>
  );
};

export default CombatTimelinePage;
