import {
  Align,
  Button,
  Checkbox,
  FormField,
  FormFieldGroup,
  IconName,
  Input,
  InputType,
  Orientation,
  Pill,
  Select,
  Size,
  Spacing,
  Spinner,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  Variant,
} from "@voxel51/voodo";
import React, { useMemo } from "react";
import type { AvailableSignal, SignalsForm as Form, SignalsProgress } from "../types";
import { formatPct, suggestBrainKey, validateSignalsForm } from "../utils";
import Disclosure from "./Disclosure";

const HASHES: { key: "phash" | "dhash" | "pdq"; label: string; description: string }[] = [
  { key: "phash", label: "pHash", description: "64-bit perceptual hash; survives resizing and recompression" },
  { key: "dhash", label: "dHash", description: "64-bit gradient hash; fast, sensitive to crops" },
  { key: "pdq", label: "PDQ", description: "Meta's 256-bit hash built for matching edited copies" },
];

type Props = {
  form: Form;
  onChange: (form: Form) => void;
  signals: AvailableSignal[];
  scopeOptions: { value: string; label: string }[];
  embeddingModels: string[];
  progress: SignalsProgress | null | undefined;
  onCompute: () => void;
};

export default function SignalsForm({
  form,
  onChange,
  signals,
  scopeOptions,
  embeddingModels,
  progress,
  onCompute,
}: Props) {
  const keyEdited = form.brain_key !== suggestBrainKey(form.model);
  const scopes = useMemo(
    () => scopeOptions.map((o) => ({ id: o.value, data: { label: o.label } })),
    [scopeOptions],
  );
  const models = useMemo(
    () => embeddingModels.map((m) => ({ id: m, data: { label: m } })),
    [embeddingModels],
  );

  const set = (patch: Partial<Form>) => onChange({ ...form, ...patch });
  const error = validateSignalsForm(form);
  const busy = progress?.state === "queued" || progress?.state === "running";
  const indexExists = signals.some(
    (s) => s.kind === "embedding" && s.name === form.brain_key,
  );

  return (
    <FormFieldGroup orientation={Orientation.Column} spacing={Spacing.Md}>
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        Rules compare images using hashes stored on each sample and an
        embedding index. Compute them once; rerunning only fills in what's
        missing.
      </Text>

      <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center} style={{ flexWrap: "wrap" }}>
        <Text variant={TextVariant.Label}>Computed so far</Text>
        {signals.length ? (
          signals.map((s) => (
            <Pill key={s.name} size={Size.Xs}>
              {s.kind === "embedding" && s.model ? `${s.name} (${s.model})` : s.name}
            </Pill>
          ))
        ) : (
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            nothing yet
          </Text>
        )}
      </Stack>

      <div style={{ maxWidth: 320 }}>
        <FormField
          label="Images to process"
          control={
            <Select
              exclusive
              portal
              options={scopes}
              value={form.scope}
              onChange={(v) => typeof v === "string" && set({ scope: v })}
            />
          }
        />
      </div>

      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        <Text variant={TextVariant.Label}>Hashes</Text>
        {HASHES.map(({ key, label, description }) => (
          <Stack key={key} orientation={Orientation.Row} spacing={Spacing.Md} align={Align.Center}>
            <div style={{ width: 110 }}>
              <Checkbox
                size={Size.Sm}
                label={label}
                checked={form[key]}
                onChange={(checked) => set({ [key]: checked })}
              />
            </div>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {description}
            </Text>
          </Stack>
        ))}
      </Stack>

      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        <Toggle
          size={Size.Sm}
          label="Embedding index"
          checked={form.embeddings}
          onChange={(embeddings) => set({ embeddings })}
        />
        {form.embeddings && (
          <Stack orientation={Orientation.Row} spacing={Spacing.Md} style={{ flexWrap: "wrap" }}>
            <div style={{ flex: "2 1 260px" }}>
              <FormField
                label="Model"
                description="Any zoo model that produces embeddings. Type to search"
                control={
                  <Select
                    exclusive
                    portal
                    options={models}
                    value={form.model}
                    onChange={(v) => {
                      if (typeof v !== "string") return;
                      set(keyEdited ? { model: v } : { model: v, brain_key: suggestBrainKey(v) });
                    }}
                  />
                }
              />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <FormField
                label="Index name"
                description={
                  indexExists && !form.overwrite_index
                    ? "Already exists; it will be kept"
                    : "Becomes the signal's name in rules"
                }
                control={
                  <Input
                    size={Size.Sm}
                    value={form.brain_key}
                    onChange={(e) => set({ brain_key: e.target.value })}
                  />
                }
              />
            </div>
            <div style={{ flex: "0 1 120px" }}>
              <FormField
                label="Batch size"
                control={
                  <Input
                    size={Size.Sm}
                    type={InputType.Number}
                    value={String(form.batch_size)}
                    onChange={(e) => set({ batch_size: Number(e.target.value) })}
                  />
                }
              />
            </div>
          </Stack>
        )}
      </Stack>

      <Disclosure label="Advanced">
        <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
          <Checkbox
            size={Size.Sm}
            label="Skip images that already have these hashes"
            checked={form.skip_existing}
            onChange={(skip_existing) => set({ skip_existing })}
          />
          <Checkbox
            size={Size.Sm}
            label="Rebuild the index if it already exists"
            checked={form.overwrite_index}
            onChange={(overwrite_index) => set({ overwrite_index })}
          />
          <Toggle
            size={Size.Sm}
            label="Run in the background (needs `fiftyone delegated launch` running)"
            checked={form.delegate}
            onChange={(delegate) => set({ delegate })}
          />
        </Stack>
      </Disclosure>

      <Stack orientation={Orientation.Row} spacing={Spacing.Md} align={Align.Center}>
        <div style={{ flex: 1 }}>
          <ProgressLine progress={progress} />
          {error && (
            <Text variant={TextVariant.Sm} color={TextColor.Failure}>
              {error}
            </Text>
          )}
        </div>
        <Button
          variant={Variant.Primary}
          leadingIcon={busy ? IconName.Spinner : IconName.Embeddings}
          disabled={!!error || busy}
          onClick={onCompute}
        >
          {busy ? "Computing…" : "Compute signals"}
        </Button>
      </Stack>
    </FormFieldGroup>
  );
}

function ProgressLine({ progress }: { progress: SignalsProgress | null | undefined }) {
  if (!progress) return null;

  if (progress.state === "failed") {
    return (
      <Text variant={TextVariant.Sm} color={TextColor.Failure}>
        Failed: {progress.label}
      </Text>
    );
  }

  if (progress.state === "done") {
    return (
      <Text variant={TextVariant.Sm} color={TextColor.Success}>
        Signals are ready. Switch to "Run rule".
      </Text>
    );
  }

  return (
    <Stack orientation={Orientation.Row} spacing={Spacing.Sm} align={Align.Center}>
      <Spinner size={Size.Sm} />
      <Text variant={TextVariant.Sm}>
        {progress.label}
        {progress.progress ? ` (${formatPct(progress.progress)})` : ""}
      </Text>
    </Stack>
  );
}
