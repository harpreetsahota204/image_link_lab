import { Button, Orientation, Size, Spacing, Stack, Tooltip, Variant } from "@voxel51/voodo";
import React from "react";
import { BORDER, CARD } from "../colors";

/** Zoom buttons in the canvas corner. */
export function ZoomControls({ onIn, onOut, onFit }: { onIn: () => void; onOut: () => void; onFit: () => void }) {
  return (
    <div
      style={{
        position: "absolute",
        right: 10,
        top: 10,
        padding: 4,
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        opacity: 0.92,
      }}
    >
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
        <div style={{ maxWidth: 300, lineHeight: 1.5 }}>
          <b>Thick lines</b> pass both signals; <b>thin lines</b> pass one.<br />
          <b>Click a chip</b> to show only that kind of line; click it again to go back. Shift-click to add or remove a kind.<br />
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
