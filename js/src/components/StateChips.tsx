import { Align, Orientation, Spacing, Stack, Text, TextColor, TextVariant, Tooltip } from "@voxel51/voodo";
import React from "react";
import { BORDER, CARD, STATE_COLORS } from "../colors";
import { DEFAULT_VISIBLE, type Counts } from "../graph";
import type { LinkState } from "../types";

type Props = {
  counts: Counts;
  hasTruth: boolean;
  visible: LinkState[];
  onVisible: (states: LinkState[]) => void;
};

type ChipSpec = { state: LinkState; label: string; dashed: boolean; tip: string };

const WITH_TRUTH: ChipSpec[] = [
  { state: "right", label: "right", dashed: false, tip: "Linked to the true original" },
  { state: "wrong", label: "wrong", dashed: false, tip: "Linked, but not to the true original" },
  { state: "missed", label: "missed", dashed: true, tip: "The true original, not linked" },
  { state: "none", label: "candidates", dashed: true, tip: "Stored candidates the rule does not link" },
];

const WITHOUT_TRUTH: ChipSpec[] = [
  { state: "right", label: "linked", dashed: false, tip: "Pairs the rule links" },
  { state: "none", label: "candidates", dashed: true, tip: "Stored candidates the rule does not link" },
];

/**
 * The legend, the counts and the line filter in one row. Click a chip to
 * show only that kind of line; click it again for the usual view;
 * shift-click to add or remove one kind.
 */
export default function StateChips({ counts, hasTruth, visible, onVisible }: Props) {
  const specs = hasTruth ? WITH_TRUTH : WITHOUT_TRUTH;
  const defaults = DEFAULT_VISIBLE.filter((s) => specs.some((c) => c.state === s));

  const onClick = (state: LinkState, additive: boolean) => {
    if (additive) {
      onVisible(visible.includes(state) ? visible.filter((s) => s !== state) : [...visible, state]);
      return;
    }
    const soloed = visible.length === 1 && visible[0] === state;
    onVisible(soloed ? defaults : [state]);
  };

  return (
    <Stack orientation={Orientation.Row} spacing={Spacing.Xs} align={Align.Center} style={{ flexWrap: "wrap" }}>
      {specs.map((c) => {
        const on = visible.includes(c.state);
        return (
          <Tooltip key={c.state} content={`${c.tip}. Click to show only these; shift-click to add or remove`}>
            <button
              type="button"
              onClick={(ev) => onClick(c.state, ev.shiftKey)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                borderRadius: 12,
                border: `1px solid ${on ? STATE_COLORS[c.state] : BORDER}`,
                background: CARD,
                opacity: on ? 1 : 0.45,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <svg width={18} height={6} aria-hidden>
                <line
                  x1={0}
                  y1={3}
                  x2={18}
                  y2={3}
                  stroke={STATE_COLORS[c.state]}
                  strokeWidth={c.state === "none" ? 1.5 : 3}
                  strokeDasharray={c.state === "none" ? "2 3" : c.dashed ? "5 3" : undefined}
                  strokeLinecap="round"
                />
              </svg>
              <Text variant={TextVariant.Caption} style={{ fontWeight: 600 }}>{counts[c.state]}</Text>
              <Text variant={TextVariant.Caption} color={TextColor.Secondary}>{c.label}</Text>
            </button>
          </Tooltip>
        );
      })}
    </Stack>
  );
}
