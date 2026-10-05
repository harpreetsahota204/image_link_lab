import {
  Align,
  Clickable,
  Dropdown,
  DropdownAnchor,
  Icon,
  IconName,
  Input,
  MenuIconTextItem,
  MenuSeparator,
  MenuTextItem,
  Orientation,
  Pill,
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
  Tooltip,
} from "@voxel51/voodo";
import React, { useState } from "react";
import type { Run, RunStatus } from "../types";
import { formatPct } from "../utils";
import Section from "./Section";

const STATUS_COLOR: Record<RunStatus, StatusColor> = {
  pending: StatusColor.DraftBg,
  running: StatusColor.ProgressBg,
  completed: StatusColor.ApprovedBg,
  failed: StatusColor.FailedBg,
};

type Props = {
  runs: Run[];
  activeRunId?: string;
  onApply: (runId: string) => void;
  onClone: (runId: string) => void;
  onRename: (runId: string, name: string) => void;
  onDelete: (runId: string) => void;
};

export default function RunList({
  runs,
  activeRunId,
  onApply,
  onClone,
  onRename,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Section
      title="Runs"
      subtitle="Every rule you run is saved here for this dataset. Click a run to load its results, or clone it into the form to tweak it."
    >
      {!runs.length ? (
        <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
          No runs yet.
        </Text>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Precision</TableHead>
              <TableHead>Recall</TableHead>
              <TableHead>F1</TableHead>
              <TableHead>Links</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => {
              const m = run.metrics;
              const active = run.run_id === activeRunId;
              return (
                <TableRow
                  key={run.run_id}
                  onClick={() => run.status === "completed" && editing !== run.run_id && onApply(run.run_id)}
                  style={active ? { background: "rgba(255,109,4,0.12)" } : undefined}
                >
                  <TableCell>
                    {editing === run.run_id ? (
                      <Input
                        size={Size.Sm}
                        autoFocus
                        value={draft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            onRename(run.run_id, draft);
                            setEditing(null);
                          } else if (e.key === "Escape") {
                            setEditing(null);
                          }
                        }}
                        onBlur={() => setEditing(null)}
                      />
                    ) : (
                      <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                        <Text variant={TextVariant.Sm} color={active ? TextColor.Foreground : TextColor.Primary}>
                          {run.run_name}
                        </Text>
                        <Text variant={TextVariant.Caption} color={TextColor.Secondary} style={{ fontFamily: "monospace" }}>
                          {run.rule_text}
                        </Text>
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusPill run={run} />
                  </TableCell>
                  <TableCell>{formatPct(m?.precision, 1)}</TableCell>
                  <TableCell>{formatPct(m?.recall, 1)}</TableCell>
                  <TableCell>{formatPct(m?.f1, 1)}</TableCell>
                  <TableCell>{m?.links ?? "–"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Dropdown
                      anchor={DropdownAnchor.BottomEnd}
                      trigger={
                        <Clickable aria-label="Run actions">
                          <Icon name={IconName.MoreVertical} size={Size.Sm} />
                        </Clickable>
                      }
                    >
                      <MenuIconTextItem
                        icon={IconName.GridView}
                        text="Load results"
                        disabled={run.status !== "completed"}
                        onClick={() => onApply(run.run_id)}
                      />
                      <MenuIconTextItem
                        icon={IconName.ContentCopy}
                        text="Clone into form"
                        onClick={() => onClone(run.run_id)}
                      />
                      <MenuIconTextItem
                        icon={IconName.Edit}
                        text="Rename"
                        onClick={() => {
                          setDraft(run.run_name);
                          setEditing(run.run_id);
                        }}
                      />
                      <MenuSeparator />
                      <MenuTextItem
                        destructive
                        onClick={() => {
                          const field = run.links_field ? ` and the ${run.links_field} field` : "";
                          if (window.confirm(`Delete "${run.run_name}"${field}? This can't be undone.`)) {
                            onDelete(run.run_id);
                          }
                        }}
                      >
                        Delete run and its links field
                      </MenuTextItem>
                    </Dropdown>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

function StatusPill({ run }: { run: Run }) {
  const pill = (
    <Pill isStatus size={Size.Xs} backgroundColor={STATUS_COLOR[run.status]}>
      {run.status}
    </Pill>
  );
  if (run.status !== "failed" || !run.status_details) return pill;
  return (
    <Tooltip content={<Text variant={TextVariant.Sm}>{run.status_details}</Text>}>
      <Stack orientation={Orientation.Row} align={Align.Center}>{pill}</Stack>
    </Tooltip>
  );
}
