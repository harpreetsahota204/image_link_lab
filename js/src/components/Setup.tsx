import {
  Align,
  Button,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React from "react";
import { ACCENT, BORDER, CARD } from "../colors";
import type { Status } from "../types";

type Props = {
  status: Status | undefined;
  onComputeSignals: () => void;
  onFindCopies: () => void;
};

/**
 * The two-step setup shown until the dataset has signals and candidates.
 * Each step is a button that opens the matching operator's form.
 */
export default function Setup({ status, onComputeSignals, onFindCopies }: Props) {
  const signalsDone = !!status && status.signals.phash && status.signals.clip;
  const candidatesDone = !!status?.candidates;

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Lg} align={Align.Center} style={{ padding: 32, maxWidth: 640, margin: "0 auto" }}>
      <Stack orientation={Orientation.Column} spacing={Spacing.Xs} align={Align.Center}>
        <Text variant={TextVariant.HeadingSm}>Image Link Lab</Text>
        <Text variant={TextVariant.BodySecondary} color={TextColor.Secondary} style={{ textAlign: "center" }}>
          Find which images are edited copies of which, using pixels (pHash) and meaning (CLIP) combined
          by a rule you control. Two steps, then the graph appears here.
        </Text>
      </Stack>

      <Step
        n={1}
        title="Compute signals"
        done={signalsDone}
        detail={
          signalsDone
            ? "pHash and CLIP are ready"
            : status
              ? `Missing: ${[!status.signals.phash && "pHash", !status.signals.clip && "CLIP"].filter(Boolean).join(", ")}`
              : "A perceptual hash and a CLIP embedding for every image. Runs in the background."
        }
        action={signalsDone ? "Recompute" : "Compute signals"}
        primary={!signalsDone}
        onClick={onComputeSignals}
      />
      <Step
        n={2}
        title="Find copies"
        done={candidatesDone}
        detail={
          candidatesDone
            ? "Candidates are ready; the graph draws from them"
            : "Pick the query images and where their originals might be. Gathers each query's candidate originals and applies a starting rule."
        }
        action="Find copies"
        primary={signalsDone && !candidatesDone}
        disabled={!signalsDone}
        onClick={onFindCopies}
      />
    </Stack>
  );
}

function Step({
  n,
  title,
  detail,
  done,
  action,
  primary,
  disabled,
  onClick,
}: {
  n: number;
  title: string;
  detail: string;
  done: boolean;
  action: string;
  primary: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Md}
      align={Align.Center}
      style={{ width: "100%", padding: 16, borderRadius: 10, border: `1px solid ${BORDER}`, background: CARD, boxSizing: "border-box" }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: done ? "var(--color-content-icon-success)" : ACCENT,
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {done ? "✓" : n}
      </div>
      <Stack orientation={Orientation.Column} spacing={Spacing.Xs} style={{ flex: 1 }}>
        <Text variant={TextVariant.BodyPrimary} style={{ fontWeight: 600 }}>{title}</Text>
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>{detail}</Text>
      </Stack>
      <Button size={Size.Sm} variant={primary ? Variant.Primary : Variant.Secondary} disabled={disabled} onClick={onClick}>
        {action}
      </Button>
    </Stack>
  );
}
