import { getSampleSrc } from "@fiftyone/state";
import {
  Align,
  Button,
  Justify,
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
  edge: Edge;
  rule: Rule;
  onShowPair: (ids: string[]) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
};

/** Why one line is there: both images, each signal against its limit, the verdict. */
export default function Evidence({ edge, rule, onShowPair, onOpen, onClose }: Props) {
  const results = signalResults(edge.candidate, rule);
  const pillColor =
    edge.state === "right" ? TextColor.Success
    : edge.state === "wrong" ? TextColor.Failure
    : edge.state === "missed" ? TextColor.Warning
    : TextColor.Secondary;

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
      <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center} justify={Justify.Between}>
        <Pill isStatus size={Size.Sm} color={pillColor}>{STATE_LABELS[edge.state]}</Pill>
        <Button size={Size.Xs} variant={Variant.Borderless} onClick={onClose} aria-label="Close evidence">✕</Button>
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
