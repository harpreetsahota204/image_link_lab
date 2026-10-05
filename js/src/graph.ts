/**
 * Turns the panel's data plus the current rule into edges, families and
 * counts. Pure functions; the SVG only draws what comes out of here.
 */
import { linkState, strength } from "./rule";
import type { Edge, GraphData, LinkState, OriginalNode, QueryNode, Rule } from "./types";

export type Counts = { right: number; wrong: number; missed: number; linked: number };

export type Family = {
  id: string;
  queries: QueryNode[];
  originals: OriginalNode[];
  edges: Edge[];
};

export type Model = {
  edges: Edge[];
  /** Edges worth drawing: links and misses, plus faint candidates if asked */
  visible: Edge[];
  families: Family[];
  /** Queries with nothing to draw (no links, no missed original) */
  singles: QueryNode[];
  counts: Counts;
};

export function buildEdges(graph: GraphData, rule: Rule): Edge[] {
  const edges: Edge[] = [];
  for (const query of graph.queries) {
    for (const candidate of query.candidates) {
      const original = graph.originals[candidate.sample_id];
      if (!original) continue;
      edges.push({
        id: `${query.id}->${original.id}`,
        query,
        original,
        candidate,
        state: linkState(candidate, rule),
        strength: strength(candidate, rule),
      });
    }
  }
  return edges;
}

export function countStates(edges: Edge[]): Counts {
  const counts: Counts = { right: 0, wrong: 0, missed: 0, linked: 0 };
  const linkedQueries = new Set<string>();
  for (const e of edges) {
    if (e.state === "right") counts.right += 1;
    else if (e.state === "wrong") counts.wrong += 1;
    else if (e.state === "missed") counts.missed += 1;
    if (e.state === "right" || e.state === "wrong") linkedQueries.add(e.query.id);
  }
  counts.linked = linkedQueries.size;
  return counts;
}

/** Union-find over "q:<id>" and "o:<id>" keys. */
class Groups {
  private parent = new Map<string, string>();

  find(key: string): string {
    let root = key;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let cur = key;
    while (this.parent.has(cur) && this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    if (!this.parent.has(key)) this.parent.set(key, key);
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function buildModel(graph: GraphData | null | undefined, rule: Rule, showAll: boolean): Model {
  if (!graph) {
    return { edges: [], visible: [], families: [], singles: [], counts: countStates([]) };
  }

  const edges = buildEdges(graph, rule);
  const drawn = edges.filter((e) => e.state !== "none" || showAll);

  const groups = new Groups();
  for (const e of drawn) groups.union(`q:${e.query.id}`, `o:${e.original.id}`);

  const byRoot = new Map<string, Family>();
  const queriesSeen = new Set<string>();
  const originalsSeen = new Set<string>();
  const family = (root: string) => {
    let f = byRoot.get(root);
    if (!f) {
      f = { id: root, queries: [], originals: [], edges: [] };
      byRoot.set(root, f);
    }
    return f;
  };

  for (const e of drawn) {
    const root = groups.find(`q:${e.query.id}`);
    const f = family(root);
    f.edges.push(e);
    if (!queriesSeen.has(e.query.id)) {
      queriesSeen.add(e.query.id);
      f.queries.push(e.query);
    }
    if (!originalsSeen.has(e.original.id)) {
      originalsSeen.add(e.original.id);
      f.originals.push(e.original);
    }
  }

  const families = [...byRoot.values()].sort(
    (a, b) => b.queries.length + b.originals.length - (a.queries.length + a.originals.length),
  );
  const singles = graph.queries.filter((q) => !queriesSeen.has(q.id));

  return { edges, visible: drawn, families, singles, counts: countStates(edges) };
}

export const STATE_ORDER: LinkState[] = ["missed", "none", "wrong", "right"];

/** Draw order: faint candidates first, right links on top. */
export function sortForDrawing(edges: Edge[]): Edge[] {
  return [...edges].sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
}
