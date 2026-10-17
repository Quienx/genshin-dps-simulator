import {
  ArtifactBuild,
  FieldDefinition,
  KitRow,
  SimulationValues,
} from './types';

export type FieldHandlers = {
  values: SimulationValues;
  onNumberChange: (name: string, value: string) => void;
  onFlagChange: (name: string, checked: boolean) => void;
  // Without it the artifact pieces can't be edited (totals only).
  onArtifactsChange?: (artifacts: ArtifactBuild) => void;
};

export type BuildHighlightView = {
  label: string;
  value: string;
};

export type CharacterBuildView = {
  name: string;
  avatarSrc?: string;
  highlight: BuildHighlightView | null;
  statFields: FieldDefinition[];
  // While artifacts are on: the totals computed from them.
  screenTotals: { label: string; value: string }[] | null;
  talentFields: FieldDefinition[];
};

export type ItemPieceView = {
  id: string;
  label: string;
  src: string;
};

export type ArtifactSetView = {
  name: string;
  subtitle: string;
  pieces: ItemPieceView[];
  isActive: boolean;
  fields: FieldDefinition[];
  rows: KitRow[];
};
