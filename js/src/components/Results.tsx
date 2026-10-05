import {
  Align,
  Button,
  Card,
  CardBackground,
  Clickable,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React, { useMemo } from "react";
import type { GroupMatrix, Run } from "../types";
import { formatPct, recallColor } from "../utils";
import Section from "./Section";

type Props = {
  run: Run;
  onOpenMisses: (row: string, group: string) => void;
  onShowQueries: () => void;
};

export default function Results({ run, onOpenMisses, onShowQueries }: Props) {
  const m = run.metrics;
  const scored = m?.recall !== undefined;

  return (
    <Section
      title={`Results: ${run.run_name}`}
      subtitle={
        <span style={{ fontFamily: "monospace" }}>{run.rule_text}</span>
      }
      action={
        <Button variant={Variant.Secondary} size={Size.Sm} onClick={onShowQueries}>
          Show linked queries in grid
        </Button>
      }
    >
      <Stack orientation={Orientation.Row} spacing={Spacing.Sm} style={{ flexWrap: "wrap" }}>
        {scored && (
          <>
            <Metric label="Precision" value={formatPct(m?.precision, 1)} hint="Share of links that are correct" />
            <Metric label="Recall" value={formatPct(m?.recall, 1)} hint="Share of true links found" />
            <Metric label="F1" value={formatPct(m?.f1, 1)} hint="Harmonic mean of precision and recall" />
          </>
        )}
        <Metric label="Links" value={String(m?.links ?? 0)} hint={`${m?.queries_with_links ?? 0} of ${run.num_queries} queries linked`} />
        <Metric label="Queries × pool" value={`${run.num_queries} × ${run.num_pool}`} hint="Pairs considered" />
      </Stack>

      {scored && run.group_matrix ? (
        <Heatmap matrix={run.group_matrix} onCellClick={onOpenMisses} />
      ) : (
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          Set a truth field to score this rule and see where each signal fails.
        </Text>
      )}
    </Section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Tooltip content={<Text variant={TextVariant.Sm}>{hint}</Text>}>
      <Card compact background={CardBackground.Secondary} style={{ minWidth: 110 }}>
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
            {label}
          </Text>
          <Text variant={TextVariant.Xl}>{value}</Text>
        </Stack>
      </Card>
    </Tooltip>
  );
}

function Heatmap({
  matrix,
  onCellClick,
}: {
  matrix: GroupMatrix;
  onCellClick: (row: string, group: string) => void;
}) {
  const order = useMemo(
    () =>
      matrix.groups
        .map((group, i) => ({ group, i, count: matrix.counts[i] }))
        .filter((g) => g.count > 0)
        .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group)),
    [matrix],
  );
  const columns = matrix.rows;
  const cell = { width: 60, height: 24 };

  return (
    <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        Recall by group. Each column is one signal on its own, the last is your
        rule. Click a cell to load the images that column missed into the grid.
      </Text>
      <div style={{ maxHeight: 360, overflow: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>
                <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
                  Group (true links)
                </Text>
              </th>
              {columns.map((c) => (
                <th key={c} style={{ width: cell.width }}>
                  <Text variant={TextVariant.Caption} color={c === "rule" ? TextColor.Foreground : TextColor.Secondary}>
                    {c === "rule" ? "Your rule" : c}
                  </Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map(({ group, i, count }) => (
              <tr key={group}>
                <td style={{ paddingRight: 12, whiteSpace: "nowrap" }}>
                  <Text variant={TextVariant.Sm}>
                    {group} <span style={{ opacity: 0.6 }}>({count})</span>
                  </Text>
                </td>
                {columns.map((row, r) => {
                  const value = matrix.recall[r][i];
                  return (
                    <td key={row}>
                      <Clickable onClick={() => onCellClick(row, group)}>
                        <div
                          title={`${row === "rule" ? "Your rule" : row} on ${group}: ${formatPct(value, 1)} recall. Click to see misses`}
                          style={{
                            ...cell,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 4,
                            background: recallColor(value),
                            outline: row === "rule" ? "1px solid rgba(255,255,255,0.35)" : undefined,
                          }}
                        >
                          <Text variant={TextVariant.Sm} color={TextColor.Foreground}>
                            {formatPct(value)}
                          </Text>
                        </div>
                      </Clickable>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center}>
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>0%</Text>
        <div style={{ width: 120, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${recallColor(0)}, ${recallColor(0.5)}, ${recallColor(1)})` }} />
        <Text variant={TextVariant.Caption} color={TextColor.Secondary}>100%</Text>
      </Stack>
    </Stack>
  );
}
