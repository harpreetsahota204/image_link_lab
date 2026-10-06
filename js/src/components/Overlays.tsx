import { Align, Button, Orientation, Size, Spacing, Stack, Text, TextColor, TextVariant, Tooltip, Variant } from "@voxel51/voodo";
import React from "react";
import { BORDER, CARD, STATE_COLORS } from "../colors";
import type { LinkState } from "../types";

const overlayCard: React.CSSProperties = {
  position: "absolute",
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "6px 10px",
  opacity: 0.92,
};

/** Compact legend in the canvas corner. */
export function Legend({ hasTruth }: { hasTruth: boolean }) {
  const swatch = (state: LinkState, label: string, dashed = false, width = 3) => (
    <Stack key={state} orientation={Orientation.Row} spacing={Spacing.Xs} align={Align.Center}>
      <svg width={22} height={6}>
        <line x1={0} y1={3} x2={22} y2={3} stroke={STATE_COLORS[state]} strokeWidth={width} strokeDasharray={dashed ? "5 4" : undefined} strokeLinecap="round" />
      </svg>
      <Text variant={TextVariant.Caption} color={TextColor.Secondary}>{label}</Text>
    </Stack>
  );
  return (
    <div style={{ ...overlayCard, left: 10, bottom: 10 }}>
      <Stack orientation={Orientation.Row} spacing={Spacing.Md} align={Align.Center}>
        {hasTruth ? (
          <>
            {swatch("right", "right")}
            {swatch("wrong", "wrong")}
            {swatch("missed", "missed", true)}
          </>
        ) : (
          swatch("right", "linked")
        )}
        <Stack orientation={Orientation.Row} spacing={Spacing.Xs} align={Align.Center}>
          <svg width={22} height={6}>
            <line x1={0} y1={3} x2={10} y2={3} stroke={STATE_COLORS.right} strokeWidth={3.5} strokeLinecap="round" />
            <line x1={14} y1={3} x2={22} y2={3} stroke={STATE_COLORS.right} strokeWidth={1.5} strokeLinecap="round" />
          </svg>
          <Text variant={TextVariant.Caption} color={TextColor.Secondary}>both / one signal</Text>
        </Stack>
      </Stack>
    </div>
  );
}

/** Zoom buttons in the opposite corner. */
export function ZoomControls({ onIn, onOut, onFit }: { onIn: () => void; onOut: () => void; onFit: () => void }) {
  return (
    <div style={{ ...overlayCard, right: 10, top: 10, padding: 4 }}>
      <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
        <Tooltip content="Zoom in (⌘ or Ctrl + scroll)"><Button size={Size.Xs} variant={Variant.Secondary} onClick={onIn}>+</Button></Tooltip>
        <Tooltip content="Zoom out"><Button size={Size.Xs} variant={Variant.Secondary} onClick={onOut}>−</Button></Tooltip>
        <Tooltip content="Fit everything in view"><Button size={Size.Xs} variant={Variant.Secondary} onClick={onFit}>Fit</Button></Tooltip>
      </Stack>
    </div>
  );
}

/** The interaction hints, folded into one tooltip. */
export function HelpHint() {
  return (
    <Tooltip
      content={
        <div style={{ maxWidth: 280, lineHeight: 1.5 }}>
          <b>Click a line</b> for the evidence behind it.<br />
          <b>Click an image</b> to show it and everything linked to it in the grid; click it again, the background, or press Esc to clear.<br />
          <b>Double-click an image</b> to open it.<br />
          <b>Scroll</b> to pan, <b>⌘/Ctrl + scroll</b> or the buttons to zoom, <b>drag</b> to move around.<br />
          The graph follows the grid: filter the grid and it redraws.
        </div>
      }
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: 9,
          border: `1px solid ${BORDER}`,
          fontSize: 11,
          cursor: "help",
          color: "var(--color-content-text-secondary)",
        }}
      >
        ?
      </span>
    </Tooltip>
  );
}
