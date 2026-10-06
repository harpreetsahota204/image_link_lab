import { getSampleSrc } from "@fiftyone/state";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ACCENT, BORDER, BORDER_STRONG, STATE_COLORS, TEXT_MUTED, TEXT_PRIMARY } from "../colors";
import { sortForDrawing, type Model } from "../graph";
import { ORIGINAL_SIZE, QUERY_SIZE, SINGLE_SIZE, packLayout, type Point } from "../layout";
import type { Edge } from "../types";

export type Camera = { k: number; tx: number; ty: number };

const MIN_K = 0.25;
const MAX_K = 4;
const FIT_FLOOR = 0.6;
const CLICK_SLOP = 4;

type Props = {
  model: Model;
  /** Identity of the drawn query set; the camera refits when it changes */
  graphKey: string;
  selectedEdgeId: string | null;
  /** Node whose family is filtering the grid */
  focusId: string | null;
  /** Sample IDs ticked in the grid */
  selectedSamples: string[];
  onEdgeClick: (edge: Edge) => void;
  onNodeClick: (sampleId: string) => void;
  onNodeDoubleClick: (sampleId: string) => void;
  onBackgroundClick: () => void;
  children?: React.ReactNode;
};

export type GraphHandle = { zoomIn: () => void; zoomOut: () => void; fit: () => void };

const Graph = React.forwardRef<GraphHandle, Props>(function Graph(
  {
    model,
    graphKey,
    selectedEdgeId,
    focusId,
    selectedSamples,
    onEdgeClick,
    onNodeClick,
    onNodeDoubleClick,
    onBackgroundClick,
    children,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pack to the viewport width at 1:1; the camera handles the rest
  const layout = useMemo(
    () => packLayout(model.families, model.singles, Math.max(size.width, 320)),
    [model, size.width],
  );

  const [camera, setCamera] = useState<Camera>({ k: 1, tx: 0, ty: 0 });
  const fit = useCallback(() => {
    const { width, height } = size;
    if (!layout.width || !layout.height) return;
    const k = Math.max(FIT_FLOOR, Math.min(1, width / layout.width, height / layout.height));
    const tx = Math.max(0, (width - layout.width * k) / 2);
    const ty = Math.max(0, (height - layout.height * k) / 2);
    setCamera({ k, tx, ty });
  }, [size, layout.width, layout.height]);

  // Refit when a different set of queries is drawn or the panel is resized
  const fitKey = `${graphKey}|${size.width}x${size.height}`;
  const lastFit = useRef<string | null>(null);
  useEffect(() => {
    if (lastFit.current !== fitKey) {
      lastFit.current = fitKey;
      fit();
    }
  }, [fitKey, fit]);

  const zoomBy = useCallback(
    (factor: number, cx?: number, cy?: number) =>
      setCamera((c) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, c.k * factor));
        const f = k / c.k;
        const x = cx ?? size.width / 2;
        const y = cy ?? size.height / 2;
        return { k, tx: x - (x - c.tx) * f, ty: y - (y - c.ty) * f };
      }),
    [size],
  );

  React.useImperativeHandle(ref, () => ({ zoomIn: () => zoomBy(1.25), zoomOut: () => zoomBy(0.8), fit }), [zoomBy, fit]);

  // Wheel: scroll pans, ctrl/cmd (and trackpad pinch) zooms
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      if (ev.ctrlKey || ev.metaKey) {
        zoomBy(Math.exp(-ev.deltaY * 0.002), ev.clientX - rect.left, ev.clientY - rect.top);
      } else {
        setCamera((c) => ({ ...c, tx: c.tx - ev.deltaX, ty: c.ty - ev.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Drag anywhere to pan; a press that doesn't move is a click
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onPointerDown = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    drag.current = { x: ev.clientX, y: ev.clientY, tx: camera.tx, ty: camera.ty, moved: false };
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ev.clientX - d.x;
    const dy = ev.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
    d.moved = true;
    setCamera((c) => ({ ...c, tx: d.tx + dx, ty: d.ty + dy }));
  };
  // Click handlers fire after pointerup; they check this to ignore the end of a drag
  const dragged = useRef(false);
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    dragged.current = !!d?.moved;
    setTimeout(() => {
      dragged.current = false;
    }, 0);
  };
  const guard = (fn: () => void) => () => {
    if (!dragged.current) fn();
  };

  const [hoverId, setHoverId] = useState<string | null>(null);

  const selected = useMemo(() => new Set(selectedSamples), [selectedSamples]);
  const focusEdge = model.visible.find((e) => e.id === selectedEdgeId) ?? null;
  const focusNodes = new Set<string>();
  if (focusEdge) {
    focusNodes.add(focusEdge.query.id);
    focusNodes.add(focusEdge.original.id);
  }
  if (focusId) {
    focusNodes.add(focusId);
    for (const e of model.visible) {
      if (e.query.id === focusId) focusNodes.add(e.original.id);
      if (e.original.id === focusId) focusNodes.add(e.query.id);
    }
  }
  for (const id of selected) focusNodes.add(id);
  const dimming = focusNodes.size > 0;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", touchAction: "none" }}
    >
      <svg
        width={size.width}
        height={size.height}
        style={{ display: "block", cursor: drag.current?.moved ? "grabbing" : "default", userSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={guard(onBackgroundClick)}
      >
        <defs>
          <clipPath id="ill-rounded" clipPathUnits="objectBoundingBox">
            <rect width="1" height="1" rx="0.12" ry="0.12" />
          </clipPath>
        </defs>

        <g transform={`translate(${camera.tx} ${camera.ty}) scale(${camera.k})`}>
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
                  const hovered = hoverId !== null && (e.query.id === hoverId || e.original.id === hoverId);
                  const faint = e.state === "none";
                  const opacity = isSelected || hovered ? 1 : faint ? 0.35 : dimming && !touches ? 0.2 : 0.9;
                  const strokeWidth =
                    (faint ? 1 : 1.5 + 1.5 * Math.max(0, e.strength - 1)) + (isSelected || hovered ? 1.5 : 0);
                  return (
                    <g
                      key={e.id}
                      style={{ cursor: "pointer" }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (!dragged.current) onEdgeClick(e);
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
                      title={`Original ${o.identity}\n${count} ${count === 1 ? "copy" : "copies"} linked or missed\nclick to show this family in the grid`}
                      onClick={guard(() => onNodeClick(o.id))}
                      onDoubleClick={() => onNodeDoubleClick(o.id)}
                      onHover={setHoverId}
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
                      title={`Copy ${q.identity}${q.truth ? `\ntrue original: ${q.truth}` : ""}\nclick to show it and its originals in the grid`}
                      onClick={guard(() => onNodeClick(q.id))}
                      onDoubleClick={() => onNodeDoubleClick(q.id)}
                      onHover={setHoverId}
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
                  title={`Copy ${query.identity}: no links\nclick to show it in the grid`}
                  onClick={guard(() => onNodeClick(query.id))}
                  onDoubleClick={() => onNodeDoubleClick(query.id)}
                  onHover={setHoverId}
                />
              ))}
            </g>
          )}
        </g>
      </svg>
      {children}
    </div>
  );
});

export default Graph;

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
  onClick: () => void;
  onDoubleClick: () => void;
  onHover: (id: string | null) => void;
};

function Node({ id, center, size, src, stroke, focused, dimmed, badge, title, onClick, onDoubleClick, onHover }: NodeProps) {
  const x = center.x - size / 2;
  const y = center.y - size / 2;
  return (
    <g
      style={{ cursor: "pointer" }}
      opacity={dimmed ? 0.4 : 1}
      onClick={(ev) => {
        ev.stopPropagation();
        onClick();
      }}
      onDoubleClick={(ev) => {
        ev.stopPropagation();
        onDoubleClick();
      }}
      onPointerEnter={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
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
