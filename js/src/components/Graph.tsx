import { getSampleSrc } from "@fiftyone/state";
import React, { useMemo } from "react";
import { ACCENT, BORDER, BORDER_STRONG, STATE_COLORS, TEXT_MUTED, TEXT_PRIMARY } from "../colors";
import { sortForDrawing, type Model } from "../graph";
import { ORIGINAL_SIZE, QUERY_SIZE, SINGLE_SIZE, packLayout, type Point } from "../layout";
import type { Edge } from "../types";

type Props = {
  model: Model;
  width: number;
  selectedEdgeId: string | null;
  /** Sample IDs selected in the grid */
  selectedSamples: string[];
  onEdgeClick: (edge: Edge) => void;
  onNodeClick: (sampleId: string) => void;
  onNodeDoubleClick: (sampleId: string) => void;
};

export default function Graph({
  model,
  width,
  selectedEdgeId,
  selectedSamples,
  onEdgeClick,
  onNodeClick,
  onNodeDoubleClick,
}: Props) {
  const layout = useMemo(
    () => packLayout(model.families, model.singles, Math.max(width, 280)),
    [model, width],
  );
  const selected = useMemo(() => new Set(selectedSamples), [selectedSamples]);
  const focusEdge = model.visible.find((e) => e.id === selectedEdgeId) ?? null;
  const focusNodes = new Set<string>();
  if (focusEdge) {
    focusNodes.add(focusEdge.query.id);
    focusNodes.add(focusEdge.original.id);
  }
  for (const id of selected) focusNodes.add(id);
  const dimming = focusNodes.size > 0;

  return (
    <svg width={layout.width} height={layout.height} style={{ display: "block" }}>
      <defs>
        <clipPath id="ill-rounded" clipPathUnits="objectBoundingBox">
          <rect width="1" height="1" rx="0.12" ry="0.12" />
        </clipPath>
      </defs>

      {layout.families.map((cell) => {
        const at = (key: string): Point => {
          const p = cell.positions.get(key)!;
          return { x: cell.x + p.x, y: cell.y + p.y };
        };
        const degree = new Map<string, number>();
        for (const e of cell.family.edges) {
          if (e.state !== "none") degree.set(e.original.id, (degree.get(e.original.id) ?? 0) + 1);
        }

        return (
          <g key={cell.family.id}>
            {sortForDrawing(cell.family.edges).map((e) => {
              const a = at(`q:${e.query.id}`);
              const b = at(`o:${e.original.id}`);
              const isSelected = e.id === selectedEdgeId;
              const touches = focusNodes.has(e.query.id) || focusNodes.has(e.original.id);
              const faint = e.state === "none";
              const opacity = isSelected ? 1 : faint ? 0.35 : dimming && !touches ? 0.25 : 0.9;
              const strokeWidth = faint ? 1 : 1.5 + 1.5 * Math.max(0, e.strength - 1) + (isSelected ? 1.5 : 0);
              return (
                <g
                  key={e.id}
                  style={{ cursor: "pointer" }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onEdgeClick(e);
                  }}
                >
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={STATE_COLORS[e.state]}
                    strokeWidth={strokeWidth}
                    strokeOpacity={opacity}
                    strokeDasharray={e.state === "missed" ? "6 5" : faint ? "2 4" : undefined}
                    strokeLinecap="round"
                  />
                  <title>{edgeTitle(e)}</title>
                </g>
              );
            })}

            {cell.family.originals.map((o) => {
              const p = at(`o:${o.id}`);
              const count = degree.get(o.id) ?? 0;
              return (
                <Node
                  key={o.id}
                  id={o.id}
                  center={p}
                  size={ORIGINAL_SIZE}
                  src={getSampleSrc(o.filepath)}
                  stroke={ACCENT}
                  focused={focusNodes.has(o.id)}
                  dimmed={dimming && !focusNodes.has(o.id)}
                  badge={count > 1 ? count : undefined}
                  title={`Original ${o.identity}\n${count} ${count === 1 ? "copy" : "copies"} linked or missed`}
                  onClick={onNodeClick}
                  onDoubleClick={onNodeDoubleClick}
                />
              );
            })}

            {cell.family.queries.map((q) => {
              const p = at(`q:${q.id}`);
              return (
                <Node
                  key={q.id}
                  id={q.id}
                  center={p}
                  size={QUERY_SIZE}
                  src={getSampleSrc(q.filepath)}
                  stroke={BORDER_STRONG}
                  focused={focusNodes.has(q.id)}
                  dimmed={dimming && !focusNodes.has(q.id)}
                  title={`Copy ${q.identity}${q.truth ? `\ntrue original: ${q.truth}` : ""}`}
                  onClick={onNodeClick}
                  onDoubleClick={onNodeDoubleClick}
                />
              );
            })}
          </g>
        );
      })}

      {layout.singlesTop !== null && (
        <g>
          <text x={18} y={layout.singlesTop + 14} fill={TEXT_MUTED} fontSize={12}>
            No links ({layout.singles.length}): nothing passed the rule, and no known original was missed
          </text>
          {layout.singles.map(({ query, x, y }) => (
            <Node
              key={query.id}
              id={query.id}
              center={{ x, y }}
              size={SINGLE_SIZE}
              src={getSampleSrc(query.filepath)}
              stroke={BORDER}
              focused={focusNodes.has(query.id)}
              dimmed={dimming && !focusNodes.has(query.id)}
              title={`Copy ${query.identity}: no links`}
              onClick={onNodeClick}
              onDoubleClick={onNodeDoubleClick}
            />
          ))}
        </g>
      )}
    </svg>
  );
}

function edgeTitle(e: Edge): string {
  const bits = e.candidate.phash === null ? "pHash n/a" : `pHash ${e.candidate.phash} bits`;
  const sim = e.candidate.clip === null ? "CLIP n/a" : `CLIP ${e.candidate.clip.toFixed(2)}`;
  return `${bits} · ${sim}\nclick for the evidence`;
}

type NodeProps = {
  id: string;
  center: Point;
  size: number;
  src: string;
  stroke: string;
  focused: boolean;
  dimmed: boolean;
  badge?: number;
  title: string;
  onClick: (id: string) => void;
  onDoubleClick: (id: string) => void;
};

function Node({ id, center, size, src, stroke, focused, dimmed, badge, title, onClick, onDoubleClick }: NodeProps) {
  const x = center.x - size / 2;
  const y = center.y - size / 2;
  return (
    <g
      style={{ cursor: "pointer" }}
      opacity={dimmed ? 0.45 : 1}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick(id);
      }}
      onDoubleClick={(ev) => {
        ev.stopPropagation();
        onDoubleClick(id);
      }}
    >
      <image
        href={src}
        x={x}
        y={y}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid slice"
        clipPath="url(#ill-rounded)"
      />
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={size * 0.12}
        fill="none"
        stroke={focused ? ACCENT : stroke}
        strokeWidth={focused ? 3 : 1.5}
      />
      {badge !== undefined && (
        <g>
          <circle cx={x + size} cy={y} r={9} fill={ACCENT} />
          <text x={x + size} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill={TEXT_PRIMARY}>
            {badge}
          </text>
        </g>
      )}
      <title>{title}</title>
    </g>
  );
}
