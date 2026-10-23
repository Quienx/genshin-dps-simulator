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
import { Dices, Pencil, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Panel } from '@/components/ui/panel';

import CharacterSheet from './CharacterSheet';
import CombatLog from './CombatLog';
import EnemyPanel from './EnemyPanel';
import EventPanel from './EventPanel';
import { buildMemberColors, MemberColor } from './memberColors';
import {
  loadCritMode,
  storeCritMode,
  useIsDesktop,
  useMediaQuery,
  useMinimizedPanels,
} from './panelLayout';
import PanelTitle from './PanelTitle';
import PanelToggle from './PanelToggle';
import ResizableSplit from './ResizableSplit';
import ResultsPanel from './ResultsPanel';
import { payloadOf } from './rotationDnd';
import RotationEditBar from './RotationEditBar';
import { buildRuler, fitPxPerSecond } from './ruler';
import {
  loadSavedRotations,
  loadTeamNames,
  SavedRotation,
  storeSavedRotations,
  storeTeamNames,
} from './savedRotations';
import {
  decodeSharedRotation,
  SHARE_PARAM,
  SharedRotation,
} from './shareRotation';
import TimelineChart, { TimelineMember } from './TimelineChart';
import {
  applyDrop,
  DragPayload,
  groupNormalCombos,
  holdLimitOf,
  pasteBlocks,
} from './timelineData';

// Blocks copied in edit mode (Ctrl/Cmd + C), for pasting in any team.
let copiedBlocks: RotationBlock[] = [];
import { runInBackground } from './simulationClient';
import TimelineHeader, {
  TeamActions,
  TimelineScenario,
} from './TimelineHeader';
import TimelinePlayer from './TimelinePlayer';
import usePlayback, { usePlayerShortcuts } from './usePlayback';
import RotationActionIcon from '../rotation/RotationActionIcon';
import {
  getLoadedCharacter,
  getLoadedVariant,
  showBuilds,
} from '../../_lib/characterData';
import { CHARACTER_LIST } from '../../_lib/characters';
import { splitTeamActionId } from '../../_lib/engine/simulateTeam';
import { iconUrl } from '../../_lib/genshinIcons';
import { buildInspectorView } from '../../_lib/inspector';
import { readNumber } from '../../_lib/readValue';
import { removeBlocks, selectRange } from '../../_lib/rotation/blocks';
import { RotationBlock, RotationSetting } from '../../_lib/rotation/types';
import { executeRun, RunRequest } from '../../_lib/runRequest';
import { parseValues } from '../../_lib/simulationValues';
import {
  buildDefaultTeam,
  buildMemberValues,
  buildPresetRotation,
  buildPresetTeam,
  buildRotationFromRun,
  createTeamBlock,
  DEFAULT_SWAP_DELAY_FRAMES,
  getTeamActions,
  INSPECTOR_TEST_IDS,
  isSwapAction,
  MAVUIKA_PRESETS,
  NEFER_PRESETS,
  TEAM_PRESET_ROTATION,
  TeamRun,
  TeamState,
} from '../../_lib/team';
import { CritMode, SimulationValues } from '../../_lib/types';
import { getWeaponRefinement } from '../../_lib/weapons';

const ZOOM_STEP = 1.25;
// Edit mode: empty seconds after the run, room to drop new blocks in.
const EDIT_ROOM_SECONDS = 10;
// Wide enough to read every action: the timeline scrolls, as in a video
// editor.
const DEFAULT_PX_PER_SECOND = 60;
const MIN_PX_PER_SECOND = 1;
const MAX_PX_PER_SECOND = 400;

// `version` counts the runs (an open build sheet starts over on each);
// `change` is its total against the scenario's last run with the same
// CRIT mode (null: the first).
type ScenarioRun = {
  members: SimulationValues[];
  run: TeamRun;
  version: number;
  change: number | null;
};

type Scenario = TimelineScenario & {
  // Its members' default builds, and its run with any builds (as a request
  // the simulation worker plays: see runRequest).
  defaults: () => SimulationValues[];
  request: (members: SimulationValues[], critMode: CritMode) => RunRequest;
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
    request: (members, critMode) => ({
      kind: 'team',
      team: { ...buildDefaultTeam(), members },
      critMode,
    }),
    setup: TEAM_SETUP,
  },
  ...[...MAVUIKA_PRESETS, ...NEFER_PRESETS].map(
    (preset): Scenario => ({
      id: preset.id,
      label: preset.label,
      group: 'team',
      avatars: preset.members,
      defaults: () => buildPresetTeam(preset).members,
      request: (members, critMode) => ({
        kind: 'team',
        team: { ...buildPresetTeam(preset), members },
        critMode,
      }),
      setup: TEAM_SETUP,
    })
  ),
  {
    id: 'inspector',
    label: 'Chevreuse + Iansan test',
    group: 'team',
    avatars: INSPECTOR_TEST_IDS,
    defaults: () => INSPECTOR_TEST_IDS.map(buildMemberValues),
    request: (members, critMode) => ({ kind: 'inspector', members, critMode }),
    setup: TEAM_SETUP,
  },
  ...CHARACTER_LIST.map(
    (character): Scenario => ({
      id: `solo:${character.id}`,
      label: character.name,
      group: 'solo',
      avatars: [character.id],
      defaults: () => [buildMemberValues(character.id)],
      request: ([values], critMode) => ({ kind: 'solo', values, critMode }),
      // As runSolo plays it.
      setup: { fillWhileWaiting: false, swapDelayFrames: 0, auras: false },
    })
  ),
];

// A team of one's own (`custom:mavuika,iansan`, a shared link's): the
// preset rotation when every member has steps in it (part of Varesa's
// team), else the first member's automatic list; edit mode writes the rest.
const CUSTOM_PREFIX = 'custom:';
// The team being edited, picked with the Team button (one at a time):
// `draft:mavuika,citlali`, in the menu's "In edition" until it is saved.
const DRAFT_PREFIX = 'draft:';
// A team saved under a name: `mine:<n>:mavuika,citlali` ("My teams").
const MINE_PREFIX = 'mine:';
const CUSTOM_TEAM_MAX = 4;
const parseMembers = (list: string): string[] | null => {
  const ids = list.split(',');
  const known = new Set(CHARACTER_LIST.map((character) => character.id));
  return ids.length >= 1 &&
    ids.length <= CUSTOM_TEAM_MAX &&
    new Set(ids).size === ids.length &&
    ids.every((characterId) => known.has(characterId as never))
    ? ids
    : null;
};
const parseCustomTeam = (id: string): string[] | null =>
  id.startsWith(CUSTOM_PREFIX)
    ? parseMembers(id.slice(CUSTOM_PREFIX.length))
    : null;
const parseDraft = (id: string): string[] | null =>
  id.startsWith(DRAFT_PREFIX)
    ? parseMembers(id.slice(DRAFT_PREFIX.length))
    : null;
const parseMine = (id: string): string[] | null => {
  const match = id.match(/^mine:\d+:(.+)$/);
  return match ? parseMembers(match[1]) : null;
};
const draftIdFor = (ids: string[]) => `${DRAFT_PREFIX}${ids.join(',')}`;
const namesOf = (ids: string[]) =>
  ids.map((id) => getLoadedCharacter(id).character.name).join(' + ');

// The names of the saved teams (loaded from this browser on start).
let teamNames: Record<string, string> = {};

const customScenario = (ids: string[]): Scenario => ({
  id: `${CUSTOM_PREFIX}${ids.join(',')}`,
  label: namesOf(ids),
  group: 'team',
  avatars: ids,
  defaults: () => ids.map(buildMemberValues),
  request: (members, critMode) => {
    const inPreset = ids.every((id) =>
      TEAM_PRESET_ROTATION.some(([characterId]) => characterId === id)
    );
    return {
      kind: 'team',
      team: {
        members,
        rotation: inPreset ? buildPresetRotation(ids) : null,
        ...TEAM_SETUP,
      },
      critMode,
    };
  },
  setup: TEAM_SETUP,
});
const scenarioOf = (id: string): Scenario => {
  const custom = parseCustomTeam(id);
  if (custom) {
    return customScenario(custom);
  }
  const draft = parseDraft(id);
  if (draft) {
    return {
      ...customScenario(draft),
      id,
      label: namesOf(draft),
      group: 'draft',
    };
  }
  const mine = parseMine(id);
  if (mine) {
    return {
      ...customScenario(mine),
      id,
      label: teamNames[id] ?? namesOf(mine),
      group: 'mine',
    };
  }
  return SCENARIOS.find((entry) => entry.id === id) ?? SCENARIOS[0];
};

// The dropdown: every preset, the draft and the saved teams (`extra`),
// and the team of one's own being shown.
const scenariosFor = (id: string, extra: string[]): Scenario[] => [
  ...extra.map(scenarioOf),
  ...SCENARIOS,
  ...(parseCustomTeam(id) ? [scenarioOf(id)] : []),
];

// A scenario id this page can open: a preset, a team of one's own, the
// draft or a saved team (`known`: the ones this browser has).
const isScenarioId = (id: string, known: string[] = []) =>
  SCENARIOS.some((entry) => entry.id === id) ||
  Boolean(parseCustomTeam(id)) ||
  ((Boolean(parseDraft(id)) || Boolean(parseMine(id))) && known.includes(id));

// The scenario picked is kept in the URL (?team=solo:mavuika), so a reload
// or a shared link opens it again.
const SCENARIO_PARAM = 'team';
const readUrlScenario = (known: string[]): string => {
  const id = new URLSearchParams(window.location.search).get(SCENARIO_PARAM);
  return id && isScenarioId(id, known) ? id : SCENARIOS[0].id;
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

// A friend's rotation as this app can play it: its team must be one the
// app knows, with the same members in the same order. Each build fills in
// what it lacks from the character's defaults; rotation blocks whose
// action is gone (a character changed) are dropped, and Swap blocks (the
// engine swaps by itself). A string: why not.
const resolveShared = (
  shared: SharedRotation
):
  | { id: string; builds: SimulationValues[]; setup: OwnSetup | null }
  | string => {
  const id = shared.scenario;
  if (!SCENARIOS.some((entry) => entry.id === id) && !parseCustomTeam(id)) {
    return 'That team is not in this version of the simulator.';
  }
  const defaults = scenarioOf(id).defaults();
  if (
    defaults.length !== shared.builds.length ||
    defaults.some(
      (values, index) => values.character !== shared.builds[index].character
    )
  ) {
    return 'Its builds do not match the team’s members.';
  }
  const builds = defaults.map((values, index) => {
    const build = shared.builds[index];
    return {
      ...values,
      ...build,
      numbers: { ...values.numbers, ...build.numbers },
      flags: { ...values.flags, ...build.flags },
      rotation: build.rotation ?? values.rotation,
    };
  });
  if (!shared.setup) {
    return { id, builds, setup: null };
  }
  const known = scenarioActions(id);
  const blocks = shared.setup.rotation.blocks
    .filter((entry) => known.has(entry.action) && !isSwapAction(entry.action))
    .map((entry) => ({ ...entry, uid: createTeamBlock(entry.action).uid }));
  return {
    id,
    builds,
    setup:
      blocks.length === 0
        ? null
        : {
            ...shared.setup,
            rotation: { ...shared.setup.rotation, blocks },
          },
  };
};

// A link with a shared rotation (?share=…): read once on load, then
// dropped from the address so a reload does not load it again.
const takeUrlShare = (): string | null => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get(SHARE_PARAM);
  if (code) {
    url.searchParams.delete(SHARE_PARAM);
    window.history.replaceState(window.history.state, '', url);
  }
  return code;
};

// The new inspector: the party and the player on top, the run's timeline
// below. CRITs are rolled, so the run is made in the browser only (the
// server's would not match it).
const CombatTimelinePage = () => {
  const [scenario, setScenario] = useState(SCENARIOS[0].id);
  const [state, setState] = useState<ScenarioRun | null>(null);
  // Edit mode: a rotation of one's own (null: the scenario's).
  const [editing, setEditing] = useState(false);
  const [own, setOwn] = useState<OwnSetup | null>(null);
  // The menu's draft and saved teams (ids), and a Team change waiting for
  // the user to say the draft can be replaced (its members).
  const [extras, setExtras] = useState<string[]>([]);
  const [pendingTeam, setPendingTeam] = useState<PendingTeam | null>(null);
  // Why the shared link the page was opened from could not be loaded.
  const [shareProblem, setShareProblem] = useState<string | null>(null);
  // Each hit's average CRIT (the default: every run of a rotation gives
  // the same total) or rolled, each run again. The latest is in the ref,
  // for the runs asked from callbacks made before it changed.
  const [critMode, setCritMode] = useState<CritMode>('expected');
  const critModeRef = useRef<CritMode>('expected');
  // Without builds, with the defaults. (Run outside the state update, so
  // it runs once.)
  const version = useRef(0);
  // Each scenario's last total, per CRIT mode: what a new run compares to.
  const lastTotals = useRef<Record<string, number>>({});
  // Played in the simulation worker: the page stays responsive meanwhile
  // (it shows the last run), and a run asked for after another one wins.
  const [simulating, setSimulating] = useState(false);
  const simulate = useCallback(
    (
      id: string,
      members?: SimulationValues[],
      ownSetup: OwnSetup | null = null
    ) => {
      const builds = members ?? scenarioOf(id).defaults();
      version.current += 1;
      const asked = version.current;
      setSimulating(true);
      runInBackground(
        ownSetup
          ? {
              kind: 'own',
              team: { ...ownSetup, members: builds },
              critMode: critModeRef.current,
            }
          : scenarioOf(id).request(builds, critModeRef.current)
      ).then((run) => {
        if (asked !== version.current) {
          return;
        }
        // What the inspector and team snapshots read: each build's gear.
        showBuilds(builds);
        const key = `${id}|${run.critMode}`;
        const previous = lastTotals.current[key];
        lastTotals.current[key] = run.totalDamage;
        setState({
          members: builds,
          run,
          version: asked,
          change:
            previous !== undefined && previous > 0
              ? run.totalDamage / previous - 1
              : null,
        });
        setSimulating(false);
      });
    },
    []
  );
  // Edited rotations, per scenario, kept in this browser across reloads.
  const saved = useRef<Record<string, SavedRotation>>({});
  const refreshExtras = useCallback(
    () =>
      setExtras([
        ...Object.keys(saved.current).filter((id) => parseDraft(id)),
        ...Object.keys(teamNames).filter((id) => saved.current[id]),
      ]),
    []
  );
  const keep = (id: string, next: OwnSetup | null) => {
    const rest = { ...saved.current };
    delete rest[id];
    saved.current = next ? { ...rest, [id]: next } : rest;
    storeSavedRotations(saved.current);
    refreshExtras();
  };
  // Loads a friend's rotation: its team, its builds and its rotation
  // (kept as this team's saved one). Returns why it cannot, or null.
  const applyShared = useCallback(
    (shared: SharedRotation): string | null => {
      const resolved = resolveShared(shared);
      if (typeof resolved === 'string') {
        return resolved;
      }
      const { id, builds, setup } = resolved;
      writeUrlScenario(id);
      setScenario(id);
      setEditing(false);
      setOwn(setup);
      const rest = { ...saved.current };
      delete rest[id];
      saved.current = setup ? { ...rest, [id]: setup } : rest;
      storeSavedRotations(saved.current);
      refreshExtras();
      simulate(id, builds, setup);
      return null;
    },
    [simulate, refreshExtras]
  );
  useEffect(() => {
    critModeRef.current = loadCritMode();
    setCritMode(critModeRef.current);
    teamNames = loadTeamNames();
    saved.current = loadSavedRotations(scenarioActions);
    refreshExtras();
    const initial = readUrlScenario(Object.keys(saved.current));
    const restored = saved.current[initial] ?? null;
    setScenario(initial);
    setOwn(restored);
    simulate(initial, undefined, restored);
    // Opened from a shared link: load it over the usual start.
    const code = takeUrlShare();
    if (code) {
      decodeSharedRotation(code)
        .then((shared) => {
          const problem = applyShared(shared);
          if (problem) {
            setShareProblem(problem);
          }
        })
        .catch((failure: Error) => setShareProblem(failure.message));
    }
  }, [simulate, applyShared, refreshExtras]);
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
  // The team being edited (one at a time), if any.
  const draftId = extras.find((id) => parseDraft(id)) ?? null;
  // Members picked with the Team button: they become the draft, with the
  // rotation being worked on (or the one on the chart) for the members
  // still there and their builds, in edit mode; its changes are kept as
  // they are made. A draft already there is replaced (asked first unless
  // it is the one on screen).
  const startDraft = (ids: string[]) => {
    if (!state) {
      return;
    }
    const id = draftIdFor(ids);
    const known = scenarioActions(id);
    const source = own?.rotation ?? buildRotationFromRun(state.run);
    const builds = ids.map(
      (characterId) =>
        state.members.find((member) => member.character === characterId) ??
        buildMemberValues(characterId)
    );
    const carried = source.blocks.filter(
      (block) => known.has(block.action) && !isSwapAction(block.action)
    );
    // Nothing to carry (new members only): the team's own rotation.
    const blocks =
      carried.length > 0
        ? carried
        : buildRotationFromRun(
            executeRun(scenarioOf(id).request(builds, critModeRef.current))
          ).blocks;
    const next: OwnSetup = {
      ...scenarioOf(id).setup,
      rotation: { ...source, blocks },
    };
    Object.keys(saved.current)
      .filter((entry) => parseDraft(entry) && entry !== id)
      .forEach((entry) => keep(entry, null));
    keep(id, next);
    writeUrlScenario(id);
    setScenario(id);
    setOwn(next);
    setEditing(true);
    simulate(id, builds, next);
  };
  // Asked first when it loses something: the blocks of the members taken
  // out of the rotation being edited, or the draft another team replaces.
  const handleTeamChange = (ids: string[]) => {
    const lost = (state?.members ?? [])
      .map((values) => values.character)
      .filter((characterId) => !ids.includes(characterId))
      .map((characterId) => ({
        name: getLoadedCharacter(characterId).character.name,
        blocks: (own?.rotation.blocks ?? []).filter(
          (block) => splitTeamActionId(block.action).characterId === characterId
        ).length,
      }))
      .filter((member) => member.blocks > 0);
    const replaces = draftId && !parseDraft(scenario) ? draftId : null;
    if (lost.length > 0 || replaces) {
      setPendingTeam({ ids, lost, replaces });
      return;
    }
    startDraft(ids);
  };
  // The draft, saved under a name: it moves to "My teams".
  const saveTeam = (name: string) => {
    const ids = parseDraft(scenario);
    if (!ids || !own) {
      return;
    }
    const taken = Object.keys(teamNames).map((id) =>
      Number(id.split(':')[1] ?? 0)
    );
    const id = `${MINE_PREFIX}${Math.max(0, ...taken) + 1}:${ids.join(',')}`;
    teamNames = { ...teamNames, [id]: name.trim() || namesOf(ids) };
    storeTeamNames(teamNames);
    keep(id, own);
    keep(scenario, null);
    writeUrlScenario(id);
    setScenario(id);
  };
  const deleteTeam = () => {
    const ids = parseMine(scenario);
    if (!ids) {
      return;
    }
    const rest = { ...teamNames };
    delete rest[scenario];
    teamNames = rest;
    storeTeamNames(teamNames);
    keep(scenario, null);
    handleScenarioChange(`solo:${ids[0]}`);
  };
  if (!state) {
    return (
      <main className='flex min-h-screen items-center justify-center bg-background p-4'>
        <EmptyState icon={<Dices className='animate-spin' aria-hidden />}>
          Simulating…
        </EmptyState>
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
  const shownMembers = parseDraft(scenario) ?? parseMine(scenario);
  return (
    <>
      <CombatTimeline
        builds={state.members}
        run={state.run}
        scenario={scenario}
        scenarios={scenariosFor(scenario, extras)}
        onScenarioChange={handleScenarioChange}
        onTeamChange={handleTeamChange}
        teamActions={
          parseDraft(scenario)
            ? {
                kind: 'draft',
                suggested: scenarioOf(scenario).label,
                onSave: saveTeam,
              }
            : parseMine(scenario)
            ? {
                kind: 'mine',
                name: scenarioOf(scenario).label,
                onDelete: deleteTeam,
              }
            : null
        }
        version={state.version}
        change={state.change}
        share={{
          current: {
            // A draft or a saved team is only in this browser: shared as
            // a team of one's own with the same members.
            scenario: shownMembers
              ? `${CUSTOM_PREFIX}${shownMembers.join(',')}`
              : scenario,
            builds: state.members,
            setup: own,
          },
          label: scenarioOf(scenario).label,
          onImport: applyShared,
        }}
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
        simulating={simulating}
        critMode={critMode}
        onCritModeChange={(mode) => {
          critModeRef.current = mode;
          setCritMode(mode);
          storeCritMode(mode);
          simulate(scenario, state.members, own);
        }}
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
      {pendingTeam && (
        <TeamChangeDialog
          draft={
            pendingTeam.replaces ? scenarioOf(pendingTeam.replaces).label : null
          }
          lost={pendingTeam.lost}
          onConfirm={() => {
            setPendingTeam(null);
            startDraft(pendingTeam.ids);
          }}
          onOpenDraft={
            pendingTeam.replaces
              ? () => {
                  const id = pendingTeam.replaces ?? '';
                  setPendingTeam(null);
                  handleScenarioChange(id);
                }
              : undefined
          }
          onCancel={() => setPendingTeam(null)}
        />
      )}
      <ConfirmDialog
        open={shareProblem !== null}
        onOpenChange={(open) => !open && setShareProblem(null)}
        data-testid='timeline-share-problem'
        title='The shared rotation could not be loaded'
        description={shareProblem}
        cancelLabel={null}
        confirmLabel='OK'
      />
    </>
  );
};

// A Team change waiting for the user: its members, the blocks it takes
// out of the rotation being edited (per member taken out), and the draft
// it replaces (null: none).
type PendingTeam = {
  ids: string[];
  lost: { name: string; blocks: number }[];
  replaces: string | null;
};

// What a Team change would lose, before it is made: the blocks of the
// members taken out, and the team in edition (there is one draft).
const TeamChangeDialog = ({
  draft,
  lost,
  onConfirm,
  onOpenDraft,
  onCancel,
}: {
  draft: string | null;
  lost: PendingTeam['lost'];
  onConfirm: () => void;
  onOpenDraft?: () => void;
  onCancel: () => void;
}) => (
  <ConfirmDialog
    open
    onOpenChange={(open) => !open && onCancel()}
    data-testid='timeline-team-change'
    confirmTestId='timeline-team-change-confirm'
    title={draft ? 'Replace the team in edition?' : 'Remove their blocks?'}
    confirmLabel={draft ? 'Replace it' : 'Remove them'}
    destructive
    onConfirm={onConfirm}
    actions={
      onOpenDraft && (
        <Button
          variant='outline'
          size='xs'
          data-testid='timeline-draft-open'
          onClick={onOpenDraft}
          className='border-brand-500/60 text-brand-100 hover:not-disabled:bg-brand-500/20'
        >
          Open the draft
        </Button>
      )
    }
  >
    {lost.length > 0 && (
      <div data-testid='timeline-team-change-lost'>
        <p>These blocks are removed from the rotation with their members:</p>
        <ul className='mt-1 list-disc pl-5 text-amber-200'>
          {lost.map((member) => (
            <li key={member.name}>
              {member.name}: {member.blocks}{' '}
              {member.blocks === 1 ? 'block' : 'blocks'}
            </li>
          ))}
        </ul>
      </div>
    )}
    {draft && (
      <p>
        You are editing <span className='font-medium'>{draft}</span>. A new team
        replaces it, with its rotation. Save it first (Save as team) to keep it.
      </p>
    )}
  </ConfirmDialog>
);

const CombatTimeline = ({
  builds,
  run,
  scenario,
  scenarios,
  onScenarioChange,
  onTeamChange,
  teamActions,
  onSimulate,
  simulating,
  critMode,
  onCritModeChange,
  version,
  change,
  onSaveBuild,
  share,
  edit,
  editing,
  onEditToggle,
  onResetRotation,
}: {
  builds: SimulationValues[];
  run: TeamRun;
  scenario: string;
  scenarios: TimelineScenario[];
  onScenarioChange: (id: string) => void;
  // A party picked in the header (its members' ids, in order).
  onTeamChange: (ids: string[]) => void;
  teamActions: TeamActions | null;
  onSimulate: () => void;
  // A run is being played in the worker (the last one is shown meanwhile).
  simulating: boolean;
  critMode: CritMode;
  onCritModeChange: (mode: CritMode) => void;
  version: number;
  change: number | null;
  onSaveBuild: (build: SimulationValues) => void;
  // Import / Export: what is on screen, and loading a friend's.
  share: {
    current: SharedRotation;
    label: string;
    onImport: (shared: SharedRotation) => string | null;
  };
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

  // Minimized panels: the others take their room. Remembered on reload.
  const { panels, togglePanel } = useMinimizedPanels();
  // Wide screens: the panels side by side, resizable. Narrow ones stack.
  const desktop = useIsDesktop();
  const wideScreen = useMediaQuery('(min-width: 1280px)');

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
  // Esc, Delete, Ctrl/Cmd + A, C, X and V on the chart.
  const selectionKey = (
    key: 'clear' | 'delete' | 'all' | 'copy' | 'cut' | 'paste',
    // Paste: the block the pointer's place goes before (null: the end);
    // undefined: the pointer is not on the chart.
    beforeUid?: string | null
  ) => {
    if (!edit) {
      return;
    }
    if (key === 'clear') {
      setPicked([]);
    } else if (key === 'all') {
      setPicked(edit.rotation.blocks.map((block) => block.uid));
    } else if (key === 'copy' || key === 'cut') {
      // The picked blocks, in rotation order; then none is picked, so a
      // paste goes where the pointer is.
      const picked = new Set(selection);
      if (picked.size > 0) {
        copiedBlocks = edit.rotation.blocks.filter((block) =>
          picked.has(block.uid)
        );
        // Cut: they leave the rotation, to be pasted elsewhere.
        if (key === 'cut') {
          edit.onChange(removeBlocks(edit.rotation, selection));
        }
        setPicked([]);
      }
    } else if (key === 'paste') {
      if (copiedBlocks.length === 0) {
        return;
      }
      // Where the pointer is on the chart; else after the last picked
      // block in the rotation, else at the end.
      const picked = new Set(selection);
      const after =
        [...edit.rotation.blocks]
          .reverse()
          .find((block) => picked.has(block.uid))?.uid ?? null;
      const result = pasteBlocks(
        edit.rotation,
        copiedBlocks,
        beforeUid === undefined ? { afterUid: after } : { beforeUid },
        new Set(actionsById.keys())
      );
      edit.onChange(result.rotation);
      setPicked(result.uids);
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
  // Space, the arrows, Home, End, + and − wherever the focus is (not in a
  // field, a dialog or a menu).
  usePlayerShortcuts({
    time: playback.time,
    duration: view.duration,
    onTogglePlay: playback.togglePlay,
    onSeek: playback.seek,
    onZoom: zoomBy,
  });
  const handleTrackWidth = useCallback(
    (width: number) => setTrackWidth(width),
    []
  );

  const chartPanel = (
    <Panel
      data-testid='timeline-panel'
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-sunken',
        panels.chart
          ? 'flex-none'
          : desktop
          ? 'h-full'
          : 'h-[60vh] lg:h-auto lg:flex-[2]'
      )}
    >
      {/* The timeline's bar: its player (the timeline drives the
          playhead) and editing. */}
      <div
        className={cn(
          'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 bg-panel px-3 py-1.5',
          !panels.chart && 'border-b border-border'
        )}
      >
        <PanelTitle section='timeline'>Timeline</PanelTitle>
        <TimelinePlayer
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
          zoomable={!panels.chart}
          className='flex-1 border-l border-border pl-3'
        />
        <div className='ml-auto flex items-center gap-2'>
          {onResetRotation && (
            <Button
              variant='secondary'
              size='xs'
              data-testid='timeline-reset-rotation'
              title='Drop your edits and go back to the scenario rotation'
              onClick={onResetRotation}
              className='font-medium'
            >
              <RotateCcw />
              Reset rotation
            </Button>
          )}
          <Button
            variant='secondary'
            size='xs'
            data-testid='timeline-edit-rotation'
            aria-pressed={editing}
            onClick={onEditToggle}
            className='font-medium'
          >
            <Pencil />
            {editing ? 'Done editing' : 'Edit rotation'}
          </Button>
          <PanelToggle
            label='timeline'
            collapsed={panels.chart}
            onToggle={() => togglePanel('chart')}
          />
        </div>
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
            holdLimit={holdLimitOf(view.actions, selectedBlock)}
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
            <span className='flex h-7 items-center gap-1 rounded-md border border-brand-400 bg-muted px-1.5 text-2xs text-foreground shadow-lg'>
              <RotationActionIcon
                action={draggedAction}
                size={18}
                className='bg-transparent p-0 ring-0'
              />
              {draggedAction.shortLabel}
              {dragging?.kind === 'move' &&
                (dragging.blockUids?.length ?? 0) > 1 && (
                  <Badge
                    size='sm'
                    data-testid='timeline-drag-count'
                    className='ml-0.5'
                  >
                    +{(dragging.blockUids?.length ?? 1) - 1}
                  </Badge>
                )}
            </span>
          )}
        </DragOverlay>
      </DndContext>
    </Panel>
  );
  const logPanel = (
    <CombatLog
      view={view}
      members={members}
      actionsById={actionsById}
      time={playback.time}
      playing={playback.playing}
      onSeek={playback.seek}
      collapsed={panels.log}
      onToggle={() => togglePanel('log')}
    />
  );
  const eventPanel = (
    <EventPanel
      view={view}
      run={run}
      members={members}
      actionsById={actionsById}
      time={playback.time}
      playing={playback.playing}
      builds={builds}
      collapsed={panels.event}
      onToggle={() => togglePanel('event')}
      pickedBlock={edit ? selectedBlock : null}
      hoveredChip={hoveredChip}
      onSeek={playback.seek}
    />
  );
  const resultsPanel = (
    <ResultsPanel
      view={view}
      members={members}
      time={playback.time}
      playing={playback.playing}
      change={change}
    />
  );
  const enemyPanel = (
    <EnemyPanel
      view={view}
      time={playback.time}
      playing={playback.playing}
      hp={enemy.hp}
      level={enemy.level}
      collapsed={panels.enemy}
      onToggle={() => togglePanel('enemy')}
    />
  );

  return (
    // The page always fits the window (no page scroll): each panel scrolls
    // on its own. Narrow screens stack the panels and scroll.
    <main
      data-testid='combat-timeline'
      className='h-dvh overflow-auto bg-background p-4 text-foreground lg:overflow-hidden'
    >
      <div className='flex flex-col gap-4 lg:h-full'>
        <TimelineHeader
          members={members}
          duration={view.duration}
          results={resultsPanel}
          onSimulate={onSimulate}
          simulating={simulating}
          critMode={critMode}
          onCritModeChange={onCritModeChange}
          scenarios={scenarios}
          scenario={scenario}
          onScenarioChange={onScenarioChange}
          onTeamChange={onTeamChange}
          teamActions={teamActions}
          onMemberClick={setOpenMember}
          share={share}
        />
        {desktop ? (
          // Left: the timeline over the log; right: the selected event
          // over the enemy. Every handle resizes.
          <ResizableSplit
            id='columns'
            orientation='horizontal'
            className='flex-1'
            panes={[
              {
                id: 'main',
                minSize: '40%',
                node: (
                  <ResizableSplit
                    id='main'
                    orientation='vertical'
                    className='h-full'
                    panes={[
                      {
                        id: 'chart',
                        node: chartPanel,
                        collapsed: panels.chart,
                        // Twice the log, as before resizing.
                        defaultSize: `${200 / 3}%`,
                        minSize: '10rem',
                      },
                      {
                        id: 'log',
                        node: logPanel,
                        collapsed: panels.log,
                        minSize: '6rem',
                      },
                    ]}
                  />
                ),
              },
              {
                id: 'side',
                // As before resizing: 20rem, 22rem from Tailwind's `xl`.
                defaultSize: wideScreen ? '22rem' : '20rem',
                minSize: '18rem',
                keepPixels: true,
                node: (
                  <ResizableSplit
                    id='side'
                    orientation='vertical'
                    className='h-full'
                    panes={[
                      {
                        id: 'event',
                        node: eventPanel,
                        collapsed: panels.event,
                        minSize: '8rem',
                      },
                      {
                        id: 'enemy',
                        node: enemyPanel,
                        collapsed: panels.enemy,
                        // Its card's own height; the event takes the rest.
                        defaultSize: 'content',
                        keepPixels: true,
                        minSize: '5rem',
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        ) : (
          <div className='grid gap-4'>
            <div className='flex min-w-0 flex-col gap-4'>
              {chartPanel}
              <div className={cn('min-h-0', !panels.log && 'h-[40vh]')}>
                {logPanel}
              </div>
            </div>
            <div className='flex min-w-0 flex-col gap-4'>
              <div className={cn('min-h-0', !panels.event && 'h-[70vh]')}>
                {eventPanel}
              </div>
              {enemyPanel}
            </div>
          </div>
        )}
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
