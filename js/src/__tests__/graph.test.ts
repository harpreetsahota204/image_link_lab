import { describe, expect, it } from "vitest";
import { DEFAULT_VISIBLE, buildModel } from "../graph";
import { layoutFamily, packLayout } from "../layout";
import type { GraphData, LinkState, Rule } from "../types";

const ALL_STATES: LinkState[] = ["right", "wrong", "missed", "none"];

const RULE: Rule = { phash_max: 10, clip_min: 0.9, combine: "any" };

function original(id: string) {
  return { id, filepath: `/o/${id}.jpg`, identity: id.toUpperCase() };
}

// Family 1: original A with copies q1 (right), q2 (right); q2 also wrongly links to B (bridge)
// Family 2: original C missed by q3
// Single: q4, a distractor with nothing passing
const GRAPH: GraphData = {
  originals: { a: original("a"), b: original("b"), c: original("c"), d: original("d") },
  queries: [
    {
      id: "q1", filepath: "/q/1.jpg", identity: "Q1", truth: "A",
      candidates: [
        { sample_id: "a", original: "A", phash: 4, clip: 0.95, is_truth: true },
        { sample_id: "d", original: "D", phash: 30, clip: 0.5, is_truth: false },
      ],
    },
    {
      id: "q2", filepath: "/q/2.jpg", identity: "Q2", truth: "A",
      candidates: [
        { sample_id: "a", original: "A", phash: 8, clip: 0.7, is_truth: true },
        { sample_id: "b", original: "B", phash: 20, clip: 0.92, is_truth: false },
      ],
    },
    {
      id: "q3", filepath: "/q/3.jpg", identity: "Q3", truth: "C",
      candidates: [{ sample_id: "c", original: "C", phash: 28, clip: 0.6, is_truth: true }],
    },
    {
      id: "q4", filepath: "/q/4.jpg", identity: "Q4", truth: null,
      candidates: [{ sample_id: "d", original: "D", phash: 25, clip: 0.4, is_truth: false }],
    },
  ],
  total: 4,
  truncated: false,
};

describe("buildModel", () => {
  it("counts states across all candidates", () => {
    const m = buildModel(GRAPH, RULE, DEFAULT_VISIBLE);
    expect(m.counts).toEqual({ right: 2, wrong: 1, missed: 1, none: 2, linked: 2 });
  });

  it("groups linked nodes into families, largest first, and leaves singles out", () => {
    const m = buildModel(GRAPH, RULE, DEFAULT_VISIBLE);
    expect(m.families.map((f) => f.queries.map((q) => q.id).sort())).toEqual([["q1", "q2"], ["q3"]]);
    expect(m.families[0].originals.map((o) => o.id).sort()).toEqual(["a", "b"]);
    expect(m.families[1].originals.map((o) => o.id)).toEqual(["c"]);
    expect(m.singles.map((q) => q.id)).toEqual(["q4"]);
  });

  it("draws only the line kinds switched on", () => {
    expect(buildModel(GRAPH, RULE, DEFAULT_VISIBLE).visible).toHaveLength(4);
    const all = buildModel(GRAPH, RULE, ALL_STATES);
    expect(all.visible).toHaveLength(6);
    expect(all.singles).toHaveLength(0);
    const onlyWrong = buildModel(GRAPH, RULE, ["wrong"]);
    expect(onlyWrong.visible.map((e) => e.state)).toEqual(["wrong"]);
    expect(onlyWrong.singles).toHaveLength(3);
  });

  it("recomputes states when the rule moves", () => {
    const strict: Rule = { phash_max: 5, clip_min: null, combine: "any" };
    const m = buildModel(GRAPH, strict, DEFAULT_VISIBLE);
    expect(m.counts).toEqual({ right: 1, wrong: 0, missed: 2, none: 3, linked: 1 });
  });

  it("thickness: strength counts passing signals", () => {
    const m = buildModel(GRAPH, RULE, DEFAULT_VISIBLE);
    const q1a = m.edges.find((e) => e.id === "q1->a")!;
    const q2a = m.edges.find((e) => e.id === "q2->a")!;
    expect(q1a.strength).toBe(2);
    expect(q2a.strength).toBe(1);
  });
});

describe("layout", () => {
  it("puts a single original in the middle and copies on a ring", () => {
    const m = buildModel(GRAPH, RULE, DEFAULT_VISIBLE);
    const fam = m.families[1]; // C with q3
    const { positions, radius } = layoutFamily(fam);
    expect(positions.get("o:c")).toEqual({ x: 0, y: 0 });
    const q = positions.get("q:q3")!;
    expect(Math.hypot(q.x, q.y)).toBeCloseTo(radius, 5);
  });

  it("spaces several originals on an inner ring and copies outside it", () => {
    const m = buildModel(GRAPH, RULE, DEFAULT_VISIBLE);
    const fam = m.families[0]; // A and B
    const { positions, radius } = layoutFamily(fam);
    const ra = Math.hypot(positions.get("o:a")!.x, positions.get("o:a")!.y);
    const rb = Math.hypot(positions.get("o:b")!.x, positions.get("o:b")!.y);
    expect(ra).toBeCloseTo(rb, 5);
    for (const q of fam.queries) {
      const p = positions.get(`q:${q.id}`)!;
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(radius, 5);
      expect(radius).toBeGreaterThan(ra);
    }
  });

  it("packs families into rows and keeps every node inside the canvas", () => {
    const m = buildModel(GRAPH, RULE, DEFAULT_VISIBLE);
    const layout = packLayout(m.families, m.singles, 500);
    expect(layout.families).toHaveLength(2);
    for (const cell of layout.families) {
      for (const p of cell.positions.values()) {
        expect(cell.x + p.x).toBeGreaterThan(0);
        expect(cell.x + p.x).toBeLessThan(layout.width);
        expect(cell.y + p.y).toBeLessThan(layout.height);
      }
      expect(cell.width).toBeGreaterThan(0);
      expect(cell.height).toBeGreaterThan(0);
    }
    // A one-copy family is a tight vertical pair, not a full ring
    const pair = layout.families[1];
    expect(pair.width).toBeLessThan(90);
    expect(layout.singles).toHaveLength(1);
    expect(layout.singlesTop).not.toBeNull();
  });

  it("wraps to a new row when a family does not fit", () => {
    const m = buildModel(GRAPH, RULE, DEFAULT_VISIBLE);
    const wide = packLayout(m.families, [], 2000);
    const narrow = packLayout(m.families, [], 300);
    expect(wide.families[0].y).toBe(wide.families[1].y);
    expect(narrow.families[1].y).toBeGreaterThan(narrow.families[0].y);
  });
});
