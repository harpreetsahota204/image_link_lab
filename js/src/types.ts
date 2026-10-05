export type SignalKind = "hash" | "embedding";
export type Fusion = "or" | "and" | "weighted";
export type RunStatus = "pending" | "running" | "completed" | "failed";
export type FieldRole = "id" | "truth" | "group" | "time";

export type AvailableSignal = {
  name: string;
  kind: SignalKind;
  source: string;
  bits?: number;
  model?: string | null;
};

export type FormSignal = {
  name: string;
  enabled: boolean;
  threshold: number;
  weight: number;
};

export type LinkForm = {
  query_scope: string;
  pool_scope: string;
  signals: FormSignal[];
  fusion: Fusion;
  cutoff: number;
  direction: boolean;
  one_parent: boolean;
  top_k: number;
  fields: Record<FieldRole, string | null>;
  run_name?: string;
};

export type RunParams = {
  run_name?: string;
  scope: { query: string; pool: string };
  fields: Partial<Record<FieldRole, string>>;
  top_k: number;
  rule: {
    signals: { name: string; threshold: number; weight: number }[];
    fusion: Fusion;
    cutoff: number;
    direction: boolean;
    one_parent: boolean;
  };
};

export type Metrics = {
  links: number;
  queries_with_links: number;
  precision?: number;
  recall?: number;
  f1?: number;
};

export type GroupMatrix = {
  rows: string[];
  groups: string[];
  recall: (number | null)[][];
  counts: number[];
};

export type Run = {
  run_id: string;
  run_name: string;
  status: RunStatus;
  rule_text?: string;
  rule: RunParams["rule"] & {
    signals: (AvailableSignal & { threshold: number; weight: number })[];
  };
  scope: { query: string; pool: string };
  fields: Partial<Record<FieldRole, string>>;
  metrics: Metrics | null;
  links_field: string | null;
  num_queries: number | null;
  num_pool: number | null;
  group_matrix?: GroupMatrix | null;
  creation_time: string;
  status_details?: string | null;
};

export type EvidenceLink = {
  target_id: string;
  sample_id: string | null;
  filepath: string | null;
  signals: Record<string, number>;
  passed: string[];
  fused?: number;
  direction?: string;
  verdict: "correct" | "wrong" | "missed" | null;
};

export type Evidence = {
  run_id: string;
  sample_id: string;
  identity: string;
  filepath: string;
  truth: string | null;
  is_query: boolean;
  signals: { name: string; kind: SignalKind; threshold: number }[];
  links: EvidenceLink[];
  missed: EvidenceLink | null;
};

export type SignalsForm = {
  scope: string;
  phash: boolean;
  dhash: boolean;
  pdq: boolean;
  embeddings: boolean;
  model: string;
  brain_key: string;
  batch_size: number;
  skip_existing: boolean;
  overwrite_index: boolean;
  delegate: boolean;
};

export type SignalsProgress = {
  state: "queued" | "running" | "done" | "failed";
  progress: number | null;
  label: string | null;
};

export type PanelData = {
  signals?: AvailableSignal[];
  signals_progress?: SignalsProgress | null;
  embedding_models?: string[];
  scope_options?: { value: string; label: string }[];
  field_options?: string[];
  form?: LinkForm;
  clone_form?: LinkForm & { nonce: string };
  runs?: Run[];
  active_run?: Run | null;
  evidence?: Evidence | null;
};

export type PanelMethods = {
  compute_signals: string;
  refresh: string;
  list_runs: string;
  run_rule: string;
  apply_run: string;
  clone_run: string;
  rename_run: string;
  delete_run: string;
  open_misses: string;
  open_links: string;
  show_queries: string;
};
