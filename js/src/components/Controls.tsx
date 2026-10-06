import {
  Button,
  Pill,
  RadioGroup,
  SingleValueSlider,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
  Orientation,
  Align,
  Justify,
} from "@voxel51/voodo";
import React from "react";
import type { Counts } from "../graph";
import { describeRule, usesClip, usesPhash } from "../rule";
import type { LinkState, Rule } from "../types";
import { HelpHint } from "./Overlays";
import StateChips from "./StateChips";

export const PHASH_SLIDER_MAX = 32;
export const CLIP_SLIDER_MIN = 0.5;

type Preset = "phash" | "clip" | "both";

type Props = {
  rule: Rule;
  onRule: (rule: Rule) => void;
  counts: Counts;
  visible: LinkState[];
  onVisible: (states: LinkState[]) => void;
  families: number;
  hasTruth: boolean;
  shown: number;
  total: number;
  /** Number of images the grid is filtered to by a click in the graph, or 0 */
  filtered: number;
  onClearFilter: () => void;
  scoring: boolean;
  onScore: () => void;
};

export default function Controls({
  rule,
  onRule,
  counts,
  visible,
  onVisible,
  families,
  hasTruth,
  shown,
  total,
  filtered,
  onClearFilter,
  scoring,
  onScore,
}: Props) {
  const preset: Preset = usesPhash(rule) && usesClip(rule) ? "both" : usesPhash(rule) ? "phash" : "clip";

  // Remember each slider's last value so switching presets doesn't lose it
  const lastPhash = React.useRef(rule.phash_max ?? 10);
  const lastClip = React.useRef(rule.clip_min ?? 0.9);
  if (rule.phash_max !== null) lastPhash.current = rule.phash_max;
  if (rule.clip_min !== null) lastClip.current = rule.clip_min;

  const setPreset = (p: Preset) =>
    onRule({
      ...rule,
      phash_max: p === "clip" ? null : lastPhash.current,
      clip_min: p === "phash" ? null : lastClip.current,
    });

  const presetButton = (p: Preset, label: string, tip: string) => (
    <Tooltip content={tip} key={p}>
      <Button
        size={Size.Sm}
        variant={preset === p ? Variant.Primary : Variant.Secondary}
        onClick={() => setPreset(p)}
      >
        {label}
      </Button>
    </Tooltip>
  );

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
      <Stack orientation={Orientation.Row} spacing={Spacing.Md} align={Align.Center} style={{ flexWrap: "wrap" }}>
        <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
          {presetButton("phash", "pHash only", "Pixels: how the image is laid out")}
          {presetButton("clip", "CLIP only", "Meaning: what the picture shows")}
          {presetButton("both", "Both", "Combine the two signals")}
        </Stack>
        {preset === "both" && (
          <RadioGroup
            size={Size.Sm}
            options={[
              { value: "any", label: "Either is enough" },
              { value: "all", label: "Both must agree" },
            ]}
            value={rule.combine}
            onChange={(v) => onRule({ ...rule, combine: v as Rule["combine"] })}
            style={{ display: "flex", gap: 12 }}
          />
        )}
      </Stack>

      <Stack orientation={Orientation.Row} spacing={Spacing.Lg} align={Align.Center} style={{ flexWrap: "wrap" }}>
        <SliderRow
          label="pHash"
          hint={rule.phash_max === null ? "off" : `≤ ${rule.phash_max} differing bits`}
          disabled={rule.phash_max === null}
        >
          <SingleValueSlider
            bare
            debounceDelay={0}
            min={0}
            max={PHASH_SLIDER_MAX}
            step={1}
            value={rule.phash_max ?? lastPhash.current}
            onChange={(v) => rule.phash_max !== null && onRule({ ...rule, phash_max: v })}
          />
        </SliderRow>
        <SliderRow
          label="CLIP"
          hint={rule.clip_min === null ? "off" : `≥ ${rule.clip_min.toFixed(2)} similarity`}
          disabled={rule.clip_min === null}
        >
          <SingleValueSlider
            bare
            debounceDelay={0}
            min={CLIP_SLIDER_MIN}
            max={1}
            step={0.01}
            value={rule.clip_min ?? lastClip.current}
            onChange={(v) => rule.clip_min !== null && onRule({ ...rule, clip_min: Math.round(v * 100) / 100 })}
          />
        </SliderRow>
      </Stack>

      <Stack orientation={Orientation.Row} spacing={Spacing.Md} align={Align.Center} justify={Justify.Between} style={{ flexWrap: "wrap" }}>
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center} style={{ flexWrap: "wrap" }}>
          <StateChips counts={counts} hasTruth={hasTruth} visible={visible} onVisible={onVisible} />
          <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
            {!hasTruth && `${counts.linked} of ${shown} linked · `}
            {total > shown ? `${shown} of ${total} copies in the grid` : `${shown} copies in the grid`}
            {families > 0 ? ` · ${families} ${families === 1 ? "family" : "families"}` : ""}
          </Text>
          <HelpHint />
        </Stack>
        <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center}>
          {/* Always laid out, so the graph doesn't jump when the chip appears */}
          <div style={{ visibility: filtered > 0 ? "visible" : "hidden" }}>
            <Pill size={Size.Sm} color={TextColor.Accent} onRemove={onClearFilter}>
              grid filtered to {filtered} {filtered === 1 ? "image" : "images"}
            </Pill>
          </div>
          <Text variant={TextVariant.Caption} color={TextColor.Secondary}>{describeRule(rule)}</Text>
          <Tooltip
            content={
              hasTruth
                ? "Writes copy_of for every query and adds a native evaluation run you can open in Model Evaluation"
                : "Writes copy_of for every query with this rule"
            }
          >
            <Button size={Size.Sm} variant={Variant.Primary} onClick={onScore} disabled={scoring}>
              {scoring ? "Scoring…" : hasTruth ? "Score this rule" : "Apply this rule"}
            </Button>
          </Tooltip>
        </Stack>
      </Stack>
    </Stack>
  );
}

function SliderRow({
  label,
  hint,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Sm}
      align={Align.Center}
      style={{ minWidth: 300, opacity: disabled ? 0.45 : 1, pointerEvents: disabled ? "none" : undefined }}
    >
      <Text variant={TextVariant.BodySecondary} style={{ width: 44, fontWeight: 600 }}>{label}</Text>
      <div style={{ flex: 1, minWidth: 140 }}>{children}</div>
      <Text variant={TextVariant.Caption} color={TextColor.Secondary} style={{ width: 150 }}>{hint}</Text>
    </Stack>
  );
}
