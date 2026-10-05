import { describe, expect, it } from "vitest";
import type { AvailableSignal, LinkForm } from "../types";
import {
  buildRunParams,
  DEFAULT_SIGNALS_FORM,
  describeRule,
  mergeSignals,
  recallColor,
  sliderRange,
  suggestBrainKey,
  validateForm,
  validateSignalsForm,
} from "../utils";

const SIGNALS: AvailableSignal[] = [
  { name: "phash", kind: "hash", source: "sig_phash", bits: 64 },
  { name: "sig_clip", kind: "embedding", source: "sig_clip" },
];

function form(overrides: Partial<LinkForm> = {}): LinkForm {
  return {
    query_scope: "tag:final_query",
    pool_scope: "tag:reference",
    signals: [
      { name: "phash", enabled: true, threshold: 16, weight: 1 },
      { name: "sig_clip", enabled: true, threshold: 0.8, weight: 1 },
    ],
    fusion: "or",
    cutoff: 0.75,
    direction: false,
    one_parent: false,
    top_k: 10,
    fields: { id: "disc21_id", truth: "reference_id", group: null, time: null },
    ...overrides,
  };
}

describe("describeRule", () => {
  it("renders OR and AND rules with thresholds", () => {
    expect(describeRule(form(), SIGNALS)).toBe("OR(phash<=16, sig_clip>=0.80)");
    expect(describeRule(form({ fusion: "and" }), SIGNALS)).toBe(
      "AND(phash<=16, sig_clip>=0.80)",
    );
  });

  it("renders weighted rules with normalized weights", () => {
    const f = form({
      fusion: "weighted",
      signals: [
        { name: "phash", enabled: true, threshold: 16, weight: 1 },
        { name: "sig_clip", enabled: true, threshold: 0.8, weight: 3 },
      ],
    });
    expect(describeRule(f, SIGNALS)).toBe(
      "WEIGHTED(0.25*phash + 0.75*sig_clip >= 0.75)",
    );
  });

  it("only mentions direction when a time field is set", () => {
    expect(describeRule(form({ direction: true }), SIGNALS)).not.toContain("parent");
    const timed = form({
      direction: true,
      fields: { id: null, truth: null, group: null, time: "posted_at" },
    });
    expect(describeRule(timed, SIGNALS)).toContain("earlier=parent");
  });

  it("skips disabled signals", () => {
    const f = form({
      signals: [
        { name: "phash", enabled: false, threshold: 16, weight: 1 },
        { name: "sig_clip", enabled: true, threshold: 0.8, weight: 1 },
      ],
    });
    expect(describeRule(f, SIGNALS)).toBe("OR(sig_clip>=0.80)");
  });
});

describe("validateForm", () => {
  it("requires an enabled signal", () => {
    const f = form({
      signals: [{ name: "phash", enabled: false, threshold: 16, weight: 1 }],
    });
    expect(validateForm(f, SIGNALS)).toMatch(/at least one signal/);
  });

  it("rejects a bad candidate count", () => {
    expect(validateForm(form({ top_k: 0 }), SIGNALS)).toMatch(/Candidates/);
    expect(validateForm(form({ top_k: 2.5 }), SIGNALS)).toMatch(/Candidates/);
  });

  it("rejects all-zero weights", () => {
    const f = form({
      fusion: "weighted",
      signals: [
        { name: "phash", enabled: true, threshold: 16, weight: 0 },
        { name: "sig_clip", enabled: true, threshold: 0.8, weight: 0 },
      ],
    });
    expect(validateForm(f, SIGNALS)).toMatch(/weight/);
  });

  it("accepts a valid form", () => {
    expect(validateForm(form(), SIGNALS)).toBeNull();
  });
});

describe("buildRunParams", () => {
  it("drops empty fields and disabled signals", () => {
    const f = form({
      signals: [
        { name: "phash", enabled: false, threshold: 16, weight: 1 },
        { name: "sig_clip", enabled: true, threshold: 0.7, weight: 2 },
      ],
    });
    const params = buildRunParams(f, SIGNALS);
    expect(params.fields).toEqual({ id: "disc21_id", truth: "reference_id" });
    expect(params.rule.signals).toEqual([
      { name: "sig_clip", threshold: 0.7, weight: 2 },
    ]);
    expect(params.scope).toEqual({ query: "tag:final_query", pool: "tag:reference" });
  });

  it("turns off direction without a time field", () => {
    const params = buildRunParams(form({ direction: true, one_parent: true }), SIGNALS);
    expect(params.rule.direction).toBe(false);
    expect(params.rule.one_parent).toBe(false);
  });
});

describe("signals form", () => {
  it("suggests readable index names", () => {
    expect(suggestBrainKey("clip-vit-base32-torch")).toBe("sig_clip");
    expect(suggestBrainKey("dinov2-vits14-torch")).toBe("sig_dinov2_vits14");
    expect(suggestBrainKey("Qwen/Qwen3-VL-Embedding-2B")).toBe(
      "sig_qwen_qwen3_vl_embedding_2b",
    );
  });

  it("accepts the defaults", () => {
    expect(validateSignalsForm(DEFAULT_SIGNALS_FORM)).toBeNull();
  });

  it("requires something to compute", () => {
    const f = { ...DEFAULT_SIGNALS_FORM, phash: false, pdq: false, embeddings: false };
    expect(validateSignalsForm(f)).toMatch(/at least one/);
  });

  it("checks the index name and batch size only when embedding", () => {
    expect(
      validateSignalsForm({ ...DEFAULT_SIGNALS_FORM, brain_key: "2bad" }),
    ).toMatch(/Index name/);
    expect(
      validateSignalsForm({ ...DEFAULT_SIGNALS_FORM, batch_size: 0 }),
    ).toMatch(/Batch size/);
    expect(
      validateSignalsForm({
        ...DEFAULT_SIGNALS_FORM,
        embeddings: false,
        brain_key: "2bad",
      }),
    ).toBeNull();
  });
});

describe("helpers", () => {
  it("merges saved form signals with newly available ones", () => {
    const merged = mergeSignals(SIGNALS, [
      { name: "phash", enabled: false, threshold: 20, weight: 1 },
    ]);
    expect(merged.map((s) => s.name)).toEqual(["phash", "sig_clip"]);
    expect(merged[0].threshold).toBe(20);
    expect(merged[1].threshold).toBe(0.8);
  });

  it("sizes sliders by signal kind", () => {
    expect(sliderRange(SIGNALS[0])).toEqual({ min: 0, max: 64, step: 1 });
    expect(sliderRange(SIGNALS[1])).toEqual({ min: 0, max: 1, step: 0.01 });
  });

  it("colors recall from red to green", () => {
    expect(recallColor(null)).toBe("transparent");
    expect(recallColor(0)).toContain("hsl(0 ");
    expect(recallColor(1)).toContain("hsl(120 ");
  });
});
