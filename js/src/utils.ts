import type {
  AvailableSignal,
  FormSignal,
  LinkForm,
  RunParams,
  SignalsForm,
} from "./types";

export const DEFAULT_EMBEDDING_MODEL = "clip-vit-base32-torch";

export const DEFAULT_SIGNALS_FORM: SignalsForm = {
  scope: "view",
  phash: true,
  dhash: false,
  pdq: true,
  embeddings: true,
  model: DEFAULT_EMBEDDING_MODEL,
  brain_key: "sig_clip",
  batch_size: 16,
  skip_existing: true,
  overwrite_index: false,
  delegate: false,
};

/** A readable index name for a zoo model, e.g. `sig_dinov2_vits14`. */
export function suggestBrainKey(model: string): string {
  if (model === DEFAULT_EMBEDDING_MODEL) return "sig_clip";
  const slug = model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_torch$/, "")
    .replace(/^_+|_+$/g, "");
  return `sig_${slug}`;
}

export function validateSignalsForm(form: SignalsForm): string | null {
  if (!form.phash && !form.dhash && !form.pdq && !form.embeddings) {
    return "Pick at least one hash or the embedding index";
  }
  if (form.embeddings) {
    if (!form.model) return "Pick an embedding model";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(form.brain_key)) {
      return "Index name must use letters, numbers and underscores, and not start with a number";
    }
    if (!Number.isInteger(form.batch_size) || form.batch_size < 1) {
      return "Batch size must be a whole number of at least 1";
    }
  }
  return null;
}

const DEFAULT_HASH_THRESHOLDS: Record<string, number> = {
  phash: 16,
  dhash: 16,
  pdq: 90,
};
const DEFAULT_EMBEDDING_THRESHOLD = 0.8;

function defaultSignal(signal: AvailableSignal): FormSignal {
  return {
    name: signal.name,
    enabled: true,
    threshold:
      signal.kind === "hash"
        ? DEFAULT_HASH_THRESHOLDS[signal.name] ?? 16
        : DEFAULT_EMBEDDING_THRESHOLD,
    weight: 1,
  };
}

/** One form entry per available signal, keeping saved values where present. */
export function mergeSignals(
  available: AvailableSignal[],
  saved: FormSignal[] = [],
): FormSignal[] {
  const byName = new Map(saved.map((s) => [s.name, s]));
  return available.map((s) => byName.get(s.name) ?? defaultSignal(s));
}

export function sliderRange(signal: AvailableSignal) {
  if (signal.kind === "hash") {
    return { min: 0, max: signal.bits ?? 64, step: 1 };
  }
  return { min: 0, max: 1, step: 0.01 };
}

function describeSignal(signal: AvailableSignal, threshold: number) {
  return signal.kind === "hash"
    ? `${signal.name}<=${Math.round(threshold)}`
    : `${signal.name}>=${threshold.toFixed(2)}`;
}

export function describeRule(
  form: LinkForm,
  available: AvailableSignal[],
): string {
  const kinds = new Map(available.map((s) => [s.name, s]));
  const enabled = form.signals.filter((s) => s.enabled && kinds.has(s.name));
  if (!enabled.length) {
    return "No signals enabled";
  }

  let text: string;
  if (form.fusion === "weighted") {
    const total = enabled.reduce((acc, s) => acc + s.weight, 0) || 1;
    const terms = enabled
      .map((s) => `${(s.weight / total).toFixed(2)}*${s.name}`)
      .join(" + ");
    text = `WEIGHTED(${terms} >= ${form.cutoff.toFixed(2)})`;
  } else {
    const terms = enabled
      .map((s) => describeSignal(kinds.get(s.name)!, s.threshold))
      .join(", ");
    text = `${form.fusion.toUpperCase()}(${terms})`;
  }

  const extras: string[] = [];
  if (form.direction && form.fields.time) extras.push("earlier=parent");
  if (form.one_parent && form.fields.time) extras.push("one parent");
  return extras.length ? `${text} + ${extras.join(", ")}` : text;
}

export function validateForm(
  form: LinkForm,
  available: AvailableSignal[],
): string | null {
  const names = new Set(available.map((s) => s.name));
  if (!form.signals.some((s) => s.enabled && names.has(s.name))) {
    return "Enable at least one signal";
  }
  if (!Number.isInteger(form.top_k) || form.top_k < 1) {
    return "Candidates per signal must be a whole number of at least 1";
  }
  if (form.fusion === "weighted") {
    const enabled = form.signals.filter((s) => s.enabled && names.has(s.name));
    if (enabled.every((s) => s.weight <= 0)) {
      return "Give at least one signal a weight above 0";
    }
  }
  return null;
}

export function buildRunParams(
  form: LinkForm,
  available: AvailableSignal[],
): RunParams {
  const names = new Set(available.map((s) => s.name));
  const fields = Object.fromEntries(
    Object.entries(form.fields).filter(([, v]) => !!v),
  ) as RunParams["fields"];
  const hasTime = !!form.fields.time;

  return {
    run_name: form.run_name?.trim() || undefined,
    scope: { query: form.query_scope, pool: form.pool_scope },
    fields,
    top_k: form.top_k,
    rule: {
      signals: form.signals
        .filter((s) => s.enabled && names.has(s.name))
        .map((s) => ({ name: s.name, threshold: s.threshold, weight: s.weight })),
      fusion: form.fusion,
      cutoff: form.cutoff,
      direction: hasTime && form.direction,
      one_parent: hasTime && form.direction && form.one_parent,
    },
  };
}

export function formatPct(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return "–";
  return `${(100 * value).toFixed(digits)}%`;
}

/** Red (0) through amber to green (1) for heatmap cells. */
export function recallColor(value: number | null): string {
  if (value === null) return "transparent";
  const v = Math.min(1, Math.max(0, value));
  const hue = Math.round(120 * v);
  return `hsl(${hue} 55% ${28 + 10 * v}%)`;
}

export function formatValue(kind: string | undefined, value: number) {
  if (kind === "hash") return `${Math.round(value)} bits`;
  return value.toFixed(3);
}
