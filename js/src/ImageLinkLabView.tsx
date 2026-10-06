import { Orientation, Spacing, Stack, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BORDER, CARD } from "./colors";
import Controls from "./components/Controls";
import Evidence from "./components/Evidence";
import Graph, { type GraphHandle } from "./components/Graph";
import { ZoomControls } from "./components/Overlays";
import Setup from "./components/Setup";
import { DEFAULT_VISIBLE, buildModel, familyOf } from "./graph";
import { usePanelClient } from "./hooks/usePanelClient";
import { usePersistentState } from "./hooks/usePersistentState";
import type { Edge, LinkState, PanelData, PanelMethods, Rule } from "./types";

type Props = {
  data: PanelData;
  schema: { view: PanelMethods & Record<string, unknown> };
};

const EVIDENCE_WIDTH = 330;
const DOUBLE_CLICK_MS = 250;

export default function ImageLinkLabView({ data, schema }: Props) {
  const call = usePanelClient(schema.view);
  const status = data?.status;
  const graph = data?.graph ?? null;
  const ready = !!status && status.signals.phash && status.signals.clip && status.candidates;

  const [rule, setRule] = usePersistentState<Rule | null>("rule", null);
  const [visible, setVisible] = usePersistentState<LinkState[]>("visible", DEFAULT_VISIBLE);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [filtered, setFiltered] = useState(0);
  const [scoring, setScoring] = useState(false);
  const graphRef = useRef<GraphHandle>(null);

  // The saved rule seeds the sliders once; after that the sliders own it
  useEffect(() => {
    if (rule === null && status?.rule) setRule(status.rule);
  }, [rule, status?.rule, setRule]);
  const activeRule = rule ?? status?.rule ?? { phash_max: 10, clip_min: 0.9, combine: "any" };

  const model = useMemo(() => buildModel(graph, activeRule, visible), [graph, activeRule, visible]);
  const graphKey = useMemo(() => (graph ? graph.queries.map((q) => q.id).join(",") : ""), [graph]);

  // Drop the evidence selection when its line is gone
  useEffect(() => {
    if (selectedEdgeId && !model.visible.some((e) => e.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [model, selectedEdgeId]);

  // Python owns the filter (it has to restore the view); the local count
  // just makes the chip appear before the round-trip finishes
  const serverFilter = data?.filter ?? null;
  useEffect(() => {
    setFiltered(serverFilter?.length ?? 0);
    if (!serverFilter) setFocusId(null);
  }, [serverFilter]);

  const filterGrid = useCallback(
    (ids: string[]) => {
      setFiltered(ids.length);
      call("filter_grid", { ids });
    },
    [call],
  );
  const clearFilter = useCallback(() => {
    setFocusId(null);
    if (filtered > 0) {
      setFiltered(0);
      call("clear_filter");
    }
  }, [call, filtered]);

  // A double-click must not fire the single-click filter first, so single
  // clicks wait long enough to be sure they are single
  const clickTimer = useRef<number | null>(null);
  const onNodeClick = useCallback(
    (id: string) => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
      clickTimer.current = window.setTimeout(() => {
        clickTimer.current = null;
        if (id === focusId) {
          clearFilter();
          return;
        }
        setFocusId(id);
        setSelectedEdgeId(null);
        filterGrid(familyOf(model, id));
      }, DOUBLE_CLICK_MS);
    },
    [focusId, model, filterGrid, clearFilter],
  );
  const onNodeDoubleClick = useCallback(
    (id: string) => {
      if (clickTimer.current) {
        window.clearTimeout(clickTimer.current);
        clickTimer.current = null;
      }
      call("open_sample", { id });
    },
    [call],
  );
  const onEdgeClick = useCallback((edge: Edge) => setSelectedEdgeId(edge.id), []);
  const onBackgroundClick = useCallback(() => {
    setSelectedEdgeId(null);
    clearFilter();
  }, [clearFilter]);

  // Esc clears everything the panel put on the grid
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onBackgroundClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBackgroundClick]);

  const onScore = useCallback(async () => {
    setScoring(true);
    try {
      await call("score_rule", { rule: activeRule });
    } finally {
      setScoring(false);
    }
  }, [call, activeRule]);

  if (!ready) {
    return (
      <div style={{ height: "100%", overflow: "auto" }}>
        <Setup
          status={status}
          onComputeSignals={() => call("run_compute_signals")}
          onFindCopies={() => call("run_find_copies")}
        />
      </div>
    );
  }

  const selectedEdge = model.visible.find((e) => e.id === selectedEdgeId) ?? null;
  const hasTruth = !!status?.has_truth;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}>
        <Controls
          rule={activeRule}
          onRule={setRule}
          counts={model.counts}
          visible={visible}
          onVisible={setVisible}
          families={model.families.length}
          hasTruth={hasTruth}
          shown={graph?.queries.length ?? 0}
          total={graph?.total ?? 0}
          filtered={filtered}
          onClearFilter={clearFilter}
          scoring={scoring}
          onScore={onScore}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {graph && graph.queries.length > 0 ? (
          <Graph
            ref={graphRef}
            model={model}
            graphKey={graphKey}
            selectedEdgeId={selectedEdgeId}
            focusId={focusId}
            selectedSamples={data?.selected ?? []}
            onEdgeClick={onEdgeClick}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onBackgroundClick={onBackgroundClick}
            allLinksShown={DEFAULT_VISIBLE.every((s) => visible.includes(s))}
          >
            <ZoomControls
              onIn={() => graphRef.current?.zoomIn()}
              onOut={() => graphRef.current?.zoomOut()}
              onFit={() => graphRef.current?.fit()}
            />
            {selectedEdge && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: EVIDENCE_WIDTH,
                  maxWidth: "85%",
                  background: CARD,
                  borderLeft: `1px solid ${BORDER}`,
                  padding: 12,
                  overflow: "auto",
                  boxSizing: "border-box",
                }}
                onClick={(ev) => ev.stopPropagation()}
              >
                <Evidence
                  edge={selectedEdge}
                  rule={activeRule}
                  onShowPair={(ids) => {
                    setFocusId(null);
                    filterGrid(ids);
                  }}
                  onOpen={(id) => call("open_sample", { id })}
                  onClose={() => setSelectedEdgeId(null)}
                />
              </div>
            )}
          </Graph>
        ) : (
          <Stack orientation={Orientation.Column} spacing={Spacing.Sm} style={{ padding: 24 }}>
            <Text variant={TextVariant.BodyPrimary} style={{ fontWeight: 600 }}>No copies in the current grid view</Text>
            <Text variant={TextVariant.BodySecondary} color={TextColor.Secondary}>
              The graph follows the grid. Clear your filters, or filter to the query images
              {status?.settings?.queries?.startsWith("tag:") ? ` (tag ${status.settings.queries.slice(4)})` : ""}
              , and the copies in view will be drawn here.
            </Text>
          </Stack>
        )}
      </div>
    </div>
  );
}
