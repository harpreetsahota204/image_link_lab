/**
 * Star layout: each family is laid out with its originals in the middle and
 * its copies on a ring around them, then families are packed into rows by
 * their bounding boxes. Copy families are stars, so this is both simpler and
 * clearer than a force-directed layout.
 */
import type { Family } from "./graph";
import type { QueryNode } from "./types";

export const QUERY_SIZE = 44;
export const ORIGINAL_SIZE = 56;
export const SINGLE_SIZE = 36;
const PAD = 16;
const GAP = 22;
const MIN_RING = 76;

export type Point = { x: number; y: number };

export type FamilyLayout = {
  family: Family;
  /** Cell origin (top-left) in the packed canvas */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Node centers relative to the cell origin */
  positions: Map<string, Point>;
};

export type Layout = {
  width: number;
  height: number;
  families: FamilyLayout[];
  singles: { query: QueryNode; x: number; y: number }[];
  singlesTop: number | null;
};

function ringRadius(count: number, nodeSize: number, min: number): number {
  // Enough circumference for every node plus a little air
  return Math.max(min, (count * nodeSize * 1.35) / (2 * Math.PI));
}

/** Lays out one family around (0, 0); returns positions and the outer radius. */
export function layoutFamily(family: Family): { positions: Map<string, Point>; radius: number } {
  const positions = new Map<string, Point>();
  const k = family.originals.length;
  const m = family.queries.length;

  let inner = 0;
  if (k === 1) {
    positions.set(`o:${family.originals[0].id}`, { x: 0, y: 0 });
  } else {
    inner = ringRadius(k, ORIGINAL_SIZE, 48);
    family.originals.forEach((o, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / k;
      positions.set(`o:${o.id}`, { x: inner * Math.cos(a), y: inner * Math.sin(a) });
    });
  }

  const outer = inner + ringRadius(m, QUERY_SIZE, MIN_RING + (k > 1 ? 30 : 0));

  // Each copy wants to sit near the originals it touches
  const target = new Map<string, number>();
  for (const q of family.queries) {
    const mine = family.edges.filter((e) => e.query.id === q.id);
    if (k === 1 || !mine.length) {
      target.set(q.id, 0);
      continue;
    }
    // Mean direction of the originals it touches (unit vectors, so two
    // originals on opposite sides don't cancel into a wrong angle)
    let sx = 0;
    let sy = 0;
    for (const e of mine) {
      const p = positions.get(`o:${e.original.id}`)!;
      const a = Math.atan2(p.y, p.x);
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    target.set(q.id, Math.atan2(sy, sx));
  }

  const ordered = [...family.queries].sort((a, b) => target.get(a.id)! - target.get(b.id)!);
  if (k === 1) {
    // One copy sits below its original, two sit either side, more fan out
    ordered.forEach((q, i) => {
      const a = m === 1 ? Math.PI / 2 : m === 2 ? (i === 0 ? Math.PI : 0) : -Math.PI / 2 + (2 * Math.PI * i) / m;
      positions.set(`q:${q.id}`, { x: outer * Math.cos(a), y: outer * Math.sin(a) });
    });
  } else {
    // Start each copy at the angle of the originals it touches, then push
    // neighbours apart until no two overlap on the ring
    const minGap = Math.min((2 * Math.PI) / m, (QUERY_SIZE * 1.35) / outer);
    const angles = ordered.map((q) => target.get(q.id)!);
    for (let i = 1; i < angles.length; i++) {
      if (angles[i] - angles[i - 1] < minGap) angles[i] = angles[i - 1] + minGap;
    }
    if (angles.length > 1 && angles[angles.length - 1] - angles[0] > 2 * Math.PI - minGap) {
      // The ring is full: fall back to even spacing from the first copy
      angles.forEach((_, i) => (angles[i] = angles[0] + (2 * Math.PI * i) / m));
    }
    ordered.forEach((q, i) => {
      positions.set(`q:${q.id}`, { x: outer * Math.cos(angles[i]), y: outer * Math.sin(angles[i]) });
    });
  }

  return { positions, radius: outer };
}

function halfSize(key: string): number {
  return (key.startsWith("o:") ? ORIGINAL_SIZE : QUERY_SIZE) / 2 + 6;
}

/** Shelf-packs families (largest first) into rows no wider than `width`. */
export function packLayout(families: Family[], singles: QueryNode[], width: number): Layout {
  const cells: FamilyLayout[] = [];
  let x = PAD;
  let y = PAD;
  let rowHeight = 0;

  for (const family of families) {
    const { positions } = layoutFamily(family);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [key, p] of positions) {
      const h = halfSize(key);
      minX = Math.min(minX, p.x - h);
      maxX = Math.max(maxX, p.x + h);
      minY = Math.min(minY, p.y - h);
      maxY = Math.max(maxY, p.y + h);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (x > PAD && x + w > width - PAD) {
      x = PAD;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    const shifted = new Map<string, Point>();
    for (const [key, p] of positions) shifted.set(key, { x: p.x - minX, y: p.y - minY });
    cells.push({ family, x, y, width: w, height: h, positions: shifted });
    x += w + GAP;
    rowHeight = Math.max(rowHeight, h);
  }

  let height = cells.length ? y + rowHeight + PAD : 0;
  let singlesTop: number | null = null;
  const placed: Layout["singles"] = [];
  if (singles.length) {
    singlesTop = cells.length ? height + GAP : PAD;
    const step = SINGLE_SIZE + 12;
    const perRow = Math.max(1, Math.floor((width - 2 * PAD) / step));
    singles.forEach((query, i) => {
      placed.push({
        query,
        x: PAD + (i % perRow) * step + SINGLE_SIZE / 2,
        y: singlesTop! + 28 + Math.floor(i / perRow) * step + SINGLE_SIZE / 2,
      });
    });
    height = singlesTop + 28 + Math.ceil(singles.length / perRow) * step + PAD;
  }

  return { width, height: Math.max(height, 0), families: cells, singles: placed, singlesTop };
}
