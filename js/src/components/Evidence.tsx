import { getSampleSrc } from "@fiftyone/state";
import {
  Align,
  Button,
  Orientation,
  Pill,
  SemanticColor,
  Size,
  Spacing,
  Stack,
  StatusColor,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import type { Evidence as EvidenceData, EvidenceLink } from "../types";
import { formatValue } from "../utils";
import Section from "./Section";

const VERDICT_STYLE = {
  correct: { label: "correct", color: StatusColor.ApprovedBg },
  wrong: { label: "wrong", color: StatusColor.FailedBg },
  missed: { label: "missed", color: StatusColor.ReviewBg },
} as const;

type Props = {
  evidence: EvidenceData | null | undefined;
  onShowInGrid: (sampleId: string) => void;
};

export default function Evidence({ evidence, onShowInGrid }: Props) {
  if (!evidence) {
    return (
      <Section title="Why this link?" subtitle="Select exactly one sample in the grid to see every link it got, with the evidence behind each.">
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          Nothing selected.
        </Text>
      </Section>
    );
  }

  const rows: EvidenceLink[] = evidence.missed
    ? [...evidence.links, evidence.missed]
    : evidence.links;

  return (
    <Section
      title="Why this link?"
      subtitle={
        evidence.truth
          ? `${evidence.identity}: known link is ${evidence.truth}`
          : evidence.identity
      }
      action={
        <Button variant={Variant.Secondary} size={Size.Sm} onClick={() => onShowInGrid(evidence.sample_id)}>
          Show in grid
        </Button>
      }
    >
      <Stack orientation={Orientation.Row} spacing={Spacing.Md} align={Align.Start}>
        <Thumb filepath={evidence.filepath} size={96} />
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs} style={{ flex: 1 }}>
          {!evidence.is_query && (
            <Text variant={TextVariant.Sm} color={TextColor.Warning}>
              This sample was not a query in this run.
            </Text>
          )}
          {evidence.is_query && !evidence.links.length && (
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              No candidate passed the rule.
            </Text>
          )}
          {evidence.missed && <MissedExplanation evidence={evidence} />}
        </Stack>
      </Stack>

      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Linked image</TableHead>
              {evidence.signals.map((s) => (
                <TableHead key={s.name}>{s.name}</TableHead>
              ))}
              <TableHead>Fused</TableHead>
              <TableHead>Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((link) => (
              <TableRow key={`${link.verdict}-${link.target_id}`}>
                <TableCell>
                  <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center}>
                    <Thumb filepath={link.filepath} size={40} />
                    <Text variant={TextVariant.Sm}>{link.target_id}</Text>
                  </Stack>
                </TableCell>
                {evidence.signals.map((s) => {
                  const passed = link.passed.includes(s.name);
                  return (
                    <TableCell key={s.name}>
                      <Pill
                        size={Size.Xs}
                        color={passed ? TextColor.Foreground : TextColor.Muted}
                        backgroundColor={passed ? SemanticColor.Success : undefined}
                      >
                        {formatValue(s.kind, link.signals[s.name])}
                      </Pill>
                    </TableCell>
                  );
                })}
                <TableCell>
                  <Text variant={TextVariant.Sm}>
                    {link.fused !== undefined ? link.fused.toFixed(2) : "–"}
                  </Text>
                </TableCell>
                <TableCell>
                  {link.verdict ? (
                    <Pill isStatus size={Size.Xs} backgroundColor={VERDICT_STYLE[link.verdict].color}>
                      {VERDICT_STYLE[link.verdict].label}
                    </Pill>
                  ) : (
                    <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                      {link.direction}
                    </Text>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

function MissedExplanation({ evidence }: { evidence: EvidenceData }) {
  const missed = evidence.missed!;
  const reasons = evidence.signals.map((s) => {
    const value = missed.signals[s.name];
    const ok = missed.passed.includes(s.name);
    const op = s.kind === "hash" ? "≤" : "≥";
    return `${s.name} ${formatValue(s.kind, value)} (needs ${op} ${formatValue(s.kind, s.threshold)}) ${ok ? "passed" : "failed"}`;
  });
  const passedSome = missed.passed.length > 0;

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
      <Text variant={TextVariant.Sm}>
        The true link {missed.target_id} was missed.
        {passedSome
          ? " It passed some thresholds, so the combine rule or the candidate limit dropped it."
          : " No signal passed its threshold."}
      </Text>
      {reasons.map((r) => (
        <Text key={r} variant={TextVariant.Sm} color={TextColor.Secondary}>
          • {r}
        </Text>
      ))}
    </Stack>
  );
}

function Thumb({ filepath, size }: { filepath: string | null; size: number }) {
  if (!filepath) {
    return <div style={{ width: size, height: size, borderRadius: 4, background: "rgba(255,255,255,0.06)" }} />;
  }
  return (
    <img
      src={getSampleSrc(filepath)}
      alt=""
      loading="lazy"
      style={{ width: size, height: size, objectFit: "cover", borderRadius: 4 }}
    />
  );
}
