import { Orientation, Spacing, Stack, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BORDER } from "./colors";
import Controls from "./components/Controls";
import Evidence from "./components/Evidence";
import Graph from "./components/Graph";
import Setup from "./components/Setup";
import { buildModel } from "./graph";
import { usePanelClient } from "./hooks/usePanelClient";
import { usePersistentState } from "./hooks/usePersistentState";
import type { Edge, PanelData, PanelMethods, Rule } from "./types";

type Props = {
  data: PanelData;
  schema: { view: PanelMethods & Record<string, unknown> };
};

const EVIDENCE_WIDTH = 340;

export default function CopyGraphView({ data, schema }: Props) {
  const call = usePanelClient(schema.view);
  const status = data?.status;
  const graph = data?.graph ?? null;
  const ready = !!status && status.signals.phash && status.signals.clip && status.candidates;

  const [rule, setRule] = usePersistentState<Rule | null>("rule", null);
  const [showAll, setShowAll] = usePersistentState<boolean>("show_all", false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);

  // The saved rule seeds the sliders once; after that the sliders own it
  useEffect(() => {
    if (rule === null && status?.rule) setRule(status.rule);
  }, [rule, status?.rule, setRule]);
  const activeRule = rule ?? status?.rule ?? { phash_max: 10, clip_min: 0.9, combine: "any" };

  const model = useMemo(() => buildModel(graph, activeRule, showAll), [graph, activeRule, showAll]);

  // Drop the evidence selection when its line is gone
  useEffect(() => {
    if (selectedEdgeId && !model.visible.some((e) => e.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [model, selectedEdgeId]);

  // Measure the panel: the evidence pane sits beside the graph when there is
  // room and below it when there isn't
  const rootRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(900);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setPanelWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);
  const sideBySide = panelWidth >= 760;
  const graphWidth = sideBySide ? panelWidth - EVIDENCE_WIDTH - 8 : panelWidth - 8;

  const onScore = useCallback(async () => {
    setScoring(true);
    try {
      await call("score_rule", { rule: activeRule });
    } finally {
      setScoring(false);
    }
  }, [call, activeRule]);

  const onEdgeClick = useCallback((edge: Edge) => setSelectedEdgeId(edge.id), []);
  const onNodeClick = useCallback((id: string) => call("select_samples", { ids: [id] }), [call]);
  const onNodeDoubleClick = useCallback((id: string) => call("open_sample", { id }), [call]);

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

  return (
    <div ref={rootRef} style={{ height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${BORDER}` }}>
        <Controls
          rule={activeRule}
          onRule={setRule}
          showAll={showAll}
          onShowAll={setShowAll}
          counts={model.counts}
          hasTruth={!!status?.has_truth}
          shown={graph?.queries.length ?? 0}
          total={graph?.total ?? 0}
          scoring={scoring}
          onScore={onScore}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: sideBySide ? "row" : "column" }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto" }} onClick={() => setSelectedEdgeId(null)}>
          {graph && graph.queries.length > 0 ? (
            <Graph
              model={model}
              width={graphWidth}
              selectedEdgeId={selectedEdgeId}
              selectedSamples={data?.selected ?? []}
              onEdgeClick={onEdgeClick}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
            />
          ) : (
            <Stack orientation={Orientation.Column} spacing={Spacing.Sm} style={{ padding: 24 }}>
              <Text variant={TextVariant.Label}>No copies in the current grid view</Text>
              <Text variant={TextVariant.BodySecondary} color={TextColor.Secondary}>
                The graph follows the grid. Clear your filters, or filter to the query images
                {status?.settings?.queries?.startsWith("tag:") ? ` (tag ${status.settings.queries.slice(4)})` : ""}
                , and the copies in view will be drawn here.
              </Text>
            </Stack>
          )}
        </div>
        <div
          style={{
            width: sideBySide ? EVIDENCE_WIDTH : undefined,
            maxHeight: sideBySide ? undefined : "45%",
            flexShrink: 0,
            borderLeft: sideBySide ? `1px solid ${BORDER}` : undefined,
            borderTop: sideBySide ? undefined : `1px solid ${BORDER}`,
            padding: 12,
            overflow: "auto",
            boxSizing: "border-box",
          }}
        >
          <Evidence
            edge={selectedEdge}
            rule={activeRule}
            onShowPair={(ids) => call("show_in_grid", { ids })}
            onOpen={(id) => call("open_sample", { id })}
          />
        </div>
      </div>
    </div>
  );
}
