import { Orientation, Spacing, Stack, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BORDER, CARD } from "./colors";
import Controls from "./components/Controls";
import Evidence from "./components/Evidence";
import Graph, { type GraphHandle } from "./components/Graph";
import { Legend, ZoomControls } from "./components/Overlays";
import Setup from "./components/Setup";
import { buildModel, familyOf } from "./graph";
import { usePanelClient } from "./hooks/usePanelClient";
import { usePersistentState } from "./hooks/usePersistentState";
import type { Edge, PanelData, PanelMethods, Rule } from "./types";

type Props = {
  data: PanelData;
  schema: { view: PanelMethods & Record<string, unknown> };
};

const EVIDENCE_WIDTH = 330;

export default function CopyGraphView({ data, schema }: Props) {
  const call = usePanelClient(schema.view);
  const status = data?.status;
  const graph = data?.graph ?? null;
  const ready = !!status && status.signals.phash && status.signals.clip && status.candidates;

  const [rule, setRule] = usePersistentState<Rule | null>("rule", null);
  const [showAll, setShowAll] = usePersistentState<boolean>("show_all", false);
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

  const model = useMemo(() => buildModel(graph, activeRule, showAll), [graph, activeRule, showAll]);
  const graphKey = useMemo(() => (graph ? graph.queries.map((q) => q.id).join(",") : ""), [graph]);

  // Drop the evidence selection when its line is gone
  useEffect(() => {
    if (selectedEdgeId && !model.visible.some((e) => e.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [model, selectedEdgeId]);

  // If the grid's filter was cleared elsewhere (the grid's own clear button,
  // another panel), drop the chip and the highlight
  const extended = data?.extended_selection ?? null;
  const prevExtended = useRef<string[] | null>(null);
  useEffect(() => {
    if (prevExtended.current && !extended) {
      setFiltered(0);
      setFocusId(null);
    }
    prevExtended.current = extended;
  }, [extended]);

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

  const onNodeClick = useCallback(
    (id: string) => {
      if (id === focusId) {
        clearFilter();
        return;
      }
      setFocusId(id);
      setSelectedEdgeId(null);
      filterGrid(familyOf(model, id));
    },
    [focusId, model, filterGrid, clearFilter],
  );
  const onEdgeClick = useCallback((edge: Edge) => setSelectedEdgeId(edge.id), []);
  const onNodeDoubleClick = useCallback((id: string) => call("open_sample", { id }), [call]);
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
          showAll={showAll}
          onShowAll={setShowAll}
          counts={model.counts}
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
          >
            <Legend hasTruth={hasTruth} />
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
