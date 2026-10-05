import { getSampleSrc } from "@fiftyone/state";
import {
  Align,
  Button,
  Orientation,
  Pill,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import { STATE_COLORS, STATE_LABELS } from "../colors";
import { signalResults } from "../rule";
import type { Edge, Rule } from "../types";

type Props = {
  edge: Edge | null;
  rule: Rule;
  onShowPair: (ids: string[]) => void;
  onOpen: (id: string) => void;
};

export default function Evidence({ edge, rule, onShowPair, onOpen }: Props) {
  if (!edge) {
    return (
      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        <Text variant={TextVariant.HeadingXs}>Evidence</Text>
        <Text variant={TextVariant.BodySecondary} color={TextColor.Secondary}>
          Click a line to see why it's there: both images, each signal against its limit, and the verdict.
        </Text>
        <Text variant={TextVariant.BodySecondary} color={TextColor.Secondary}>
          Click an image to select it in the grid; double-click to open it.
        </Text>
        <Legend />
      </Stack>
    );
  }

  const results = signalResults(edge.candidate, rule);
  const pillColor =
    edge.state === "right" ? TextColor.Success
    : edge.state === "wrong" ? TextColor.Failure
    : edge.state === "missed" ? TextColor.Warning
    : TextColor.Secondary;

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
      <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center}>
        <Text variant={TextVariant.HeadingXs}>Evidence</Text>
        <Pill isStatus size={Size.Sm} color={pillColor}>{STATE_LABELS[edge.state]}</Pill>
      </Stack>

      <Stack orientation={Orientation.Row} spacing={Spacing.Md} align={Align.Start}>
        <Thumb src={getSampleSrc(edge.query.filepath)} caption="Copy" identity={edge.query.identity} />
        <div style={{ alignSelf: "center", width: 28, height: 0, borderTop: `3px solid ${STATE_COLORS[edge.state]}` }} />
        <Thumb src={getSampleSrc(edge.original.filepath)} caption="Original" identity={edge.original.identity} />
      </Stack>

      <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
        <SignalRow
          name="pHash"
          what="pixels"
          used={rule.phash_max !== null}
          value={edge.candidate.phash === null ? "n/a" : `${edge.candidate.phash} bits differ`}
          limit={rule.phash_max === null ? "" : `limit ≤ ${rule.phash_max}`}
          passed={results.phash}
        />
        <SignalRow
          name="CLIP"
          what="meaning"
          used={rule.clip_min !== null}
          value={edge.candidate.clip === null ? "n/a" : `${edge.candidate.clip.toFixed(3)} similar`}
          limit={rule.clip_min === null ? "" : `limit ≥ ${rule.clip_min.toFixed(2)}`}
          passed={results.clip}
        />
      </Stack>

      <Text variant={TextVariant.BodySecondary}>{verdict(edge, rule, results)}</Text>

      <Stack orientation={Orientation.Row} spacing={Spacing.Sm}>
        <Button size={Size.Sm} variant={Variant.Secondary} onClick={() => onShowPair([edge.query.id, edge.original.id])}>
          Show pair in grid
        </Button>
        <Button size={Size.Sm} variant={Variant.Secondary} onClick={() => onOpen(edge.query.id)}>
          Open copy
        </Button>
      </Stack>
    </Stack>
  );
}

function Thumb({ src, caption, identity }: { src: string; caption: string; identity: string }) {
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs} align={Align.Center}>
      <img
        src={src}
        alt={caption}
        style={{ width: 110, height: 110, objectFit: "cover", borderRadius: 8, display: "block" }}
      />
      <Text variant={TextVariant.Caption} color={TextColor.Secondary}>{caption}</Text>
      <Text variant={TextVariant.CodeSecondary} title={identity} style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {identity}
      </Text>
    </Stack>
  );
}

function SignalRow({
  name,
  what,
  used,
  value,
  limit,
  passed,
}: {
  name: string;
  what: string;
  used: boolean;
  value: string;
  limit: string;
  passed?: boolean;
}) {
  return (
    <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center} style={{ opacity: used ? 1 : 0.5 }}>
      <Text variant={TextVariant.BodySecondary} style={{ width: 52, fontWeight: 600 }}>{name}</Text>
      <Text variant={TextVariant.Caption} color={TextColor.Secondary} style={{ width: 56 }}>{what}</Text>
      <Text variant={TextVariant.BodySecondary} style={{ flex: 1 }}>{value}</Text>
      {used ? (
        <>
          <Text variant={TextVariant.Caption} color={TextColor.Secondary}>{limit}</Text>
          <Text
            variant={TextVariant.BodySecondary}
            color={passed ? TextColor.Success : TextColor.Failure}
            style={{ fontWeight: 600 }}
          >
            {passed ? "passes" : "fails"}
          </Text>
        </>
      ) : (
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>not used</Text>
      )}
    </Stack>
  );
}

function verdict(edge: Edge, rule: Rule, results: { phash?: boolean; clip?: boolean }): string {
  const passed = Object.entries(results).filter(([, ok]) => ok).map(([k]) => k === "phash" ? "pHash" : "CLIP");
  const failed = Object.entries(results).filter(([, ok]) => !ok).map(([k]) => k === "phash" ? "pHash" : "CLIP");
  const both = results.phash !== undefined && results.clip !== undefined;
  const how = both ? (rule.combine === "all" ? "both must agree" : "either signal is enough") : "";

  let why: string;
  if (edge.state === "right" || edge.state === "wrong") {
    why = `Linked because ${passed.join(" and ")} passed${how ? ` (${how})` : ""}.`;
  } else if (both && rule.combine === "all" && passed.length === 1) {
    why = `Not linked: ${passed[0]} passed but ${failed[0]} didn't, and the rule needs both.`;
  } else {
    why = `Not linked: ${failed.join(" and ")} ${failed.length > 1 ? "are" : "is"} outside the limit.`;
  }

  const truth = edge.candidate.is_truth;
  if (truth === undefined) return why;
  if (edge.state === "right") return `${why} This is the true original.`;
  if (edge.state === "wrong") {
    return `${why} It is not the true original${edge.query.truth ? ` (that is ${edge.query.truth})` : ""}.`;
  }
  if (edge.state === "missed") return `${why} This is the true original, so the rule missed it.`;
  return `${why} It is not the true original, so leaving it unlinked is correct.`;
}

function Legend() {
  const row = (state: Edge["state"], text: string, dashed = false) => (
    <Stack key={state} orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center}>
      <svg width={28} height={6}>
        <line x1={0} y1={3} x2={28} y2={3} stroke={STATE_COLORS[state]} strokeWidth={3} strokeDasharray={dashed ? "5 4" : undefined} />
      </svg>
      <Text variant={TextVariant.Caption} color={TextColor.Secondary}>{text}</Text>
    </Stack>
  );
  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs} style={{ marginTop: 8 }}>
      {row("right", "right link: the rule linked a copy to its true original")}
      {row("wrong", "wrong link: linked, but not the true original")}
      {row("missed", "missed: the true original, not linked", true)}
      <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
        Thick lines pass both signals; thin lines pass one.
      </Text>
    </Stack>
  );
}
