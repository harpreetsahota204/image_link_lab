export type Combine = "any" | "all";

/** Mirrors the rule dict in core/rule.py. `null` switches a signal off. */
export type Rule = {
  phash_max: number | null;
  clip_min: number | null;
  combine: Combine;
};

export type Candidate = {
  sample_id: string;
  original: string;
  phash: number | null;
  clip: number | null;
  is_truth?: boolean;
};

export type QueryNode = {
  id: string;
  filepath: string;
  identity: string;
  truth: string | null;
  candidates: Candidate[];
};

export type OriginalNode = {
  id: string;
  filepath: string;
  identity: string;
};

export type GraphData = {
  queries: QueryNode[];
  originals: Record<string, OriginalNode>;
  total: number;
  truncated: boolean;
};

export type Settings = {
  queries?: string;
  originals?: string;
  id_field?: string | null;
  truth_field?: string | null;
  output_field?: string;
  rule?: Rule;
};

export type Status = {
  signals: { phash: boolean; clip: boolean };
  candidates: boolean;
  has_truth: boolean;
  settings: Settings;
  rule: Rule;
};

export type PanelData = {
  status?: Status;
  graph?: GraphData | null;
  selected?: string[];
  /** Sample IDs the grid is currently filtered to by this panel, or null */
  filter?: string[] | null;
};

export type PanelMethods = {
  refresh: string;
  score_rule: string;
  filter_grid: string;
  clear_filter: string;
  open_sample: string;
  run_compute_signals: string;
  run_find_copies: string;
};

export type LinkState = "right" | "wrong" | "missed" | "none";

export type Edge = {
  id: string;
  query: QueryNode;
  original: OriginalNode;
  candidate: Candidate;
  state: LinkState;
  /** How many of the rule's signals pass: 0, 1 or 2 */
  strength: number;
};
