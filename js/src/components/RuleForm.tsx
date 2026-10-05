import {
  Align,
  Button,
  FormField,
  FormFieldGroup,
  IconName,
  Input,
  InputType,
  Orientation,
  Pill,
  RadioGroup,
  Select,
  SingleValueSlider,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React, { ReactNode, useMemo } from "react";
import type {
  AvailableSignal,
  FieldRole,
  FormSignal,
  Fusion,
  LinkForm,
} from "../types";
import { describeRule, sliderRange, validateForm } from "../utils";
import Disclosure from "./Disclosure";

const NONE = "__none__";

const FIELD_ROLES: { role: FieldRole; label: string; description: string }[] = [
  {
    role: "id",
    label: "ID field",
    description: "Each image's identity, used to resolve the truth field",
  },
  {
    role: "truth",
    label: "Truth field",
    description: "Identity of the known linked image. Turns on scoring",
  },
  {
    role: "group",
    label: "Group field",
    description: "Break scores down by this field, e.g. the edit applied",
  },
  {
    role: "time",
    label: "Time field",
    description: "Datetime field. The earlier image becomes the parent",
  },
];

const FUSIONS: { value: Fusion; label: string }[] = [
  { value: "or", label: "Any signal (OR)" },
  { value: "and", label: "All signals (AND)" },
  { value: "weighted", label: "Weighted score" },
];

type Props = {
  form: LinkForm;
  onChange: (form: LinkForm) => void;
  signals: AvailableSignal[];
  scopeOptions: { value: string; label: string }[];
  fieldOptions: string[];
  running: boolean;
  onRun: () => void;
};

export default function RuleForm({
  form,
  onChange,
  signals,
  scopeOptions,
  fieldOptions,
  running,
  onRun,
}: Props) {
  const scopes = useMemo(
    () => scopeOptions.map((o) => ({ id: o.value, data: { label: o.label } })),
    [scopeOptions],
  );
  const fields = useMemo(
    () => [
      { id: NONE, data: { label: "None" } },
      ...fieldOptions.map((f) => ({ id: f, data: { label: f } })),
    ],
    [fieldOptions],
  );

  const set = (patch: Partial<LinkForm>) => onChange({ ...form, ...patch });
  const setSignal = (name: string, patch: Partial<FormSignal>) =>
    set({
      signals: form.signals.map((s) =>
        s.name === name ? { ...s, ...patch } : s,
      ),
    });
  const setField = (role: FieldRole, value: string | string[] | null) =>
    set({
      fields: {
        ...form.fields,
        [role]: typeof value === "string" && value !== NONE ? value : null,
      },
    });

  const error = validateForm(form, signals);
  const hasTime = !!form.fields.time;
  const byName = new Map(form.signals.map((s) => [s.name, s]));

  return (
    <FormFieldGroup orientation={Orientation.Column} spacing={Spacing.Md}>
      <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
        Pick which images to link, which signals to trust, and how to combine
        them.
      </Text>
      <Stack orientation={Orientation.Row} spacing={Spacing.Md}>
        <div style={{ flex: 1 }}>
          <FormField
            label="Query images"
            description="Find links for these"
            control={
              <Select
                exclusive
                portal
                options={scopes}
                value={form.query_scope}
                onChange={(v) =>
                  typeof v === "string" && set({ query_scope: v })
                }
              />
            }
          />
        </div>
        <div style={{ flex: 1 }}>
          <FormField
            label="Match against"
            description="Candidate images to link to"
            control={
              <Select
                exclusive
                portal
                options={scopes}
                value={form.pool_scope}
                onChange={(v) =>
                  typeof v === "string" && set({ pool_scope: v })
                }
              />
            }
          />
        </div>
      </Stack>

      <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
        <Text variant={TextVariant.Label}>Signals</Text>
        {signals.map((signal) => {
          const value = byName.get(signal.name);
          if (!value) return null;
          const range = sliderRange(signal);
          return (
            <Stack
              key={signal.name}
              orientation={Orientation.Row}
              spacing={Spacing.Md}
              align={Align.Center}
            >
              <div style={{ width: 170 }}>
                <Toggle
                  size={Size.Sm}
                  checked={value.enabled}
                  onChange={(enabled) => setSignal(signal.name, { enabled })}
                  label={signal.name}
                />
              </div>
              <Pill size={Size.Xs}>
                {signal.kind === "hash"
                  ? `${signal.bits}-bit hash`
                  : "embedding"}
              </Pill>
              <div style={{ flex: 1, opacity: value.enabled ? 1 : 0.4 }}>
                <SingleValueSlider
                  min={range.min}
                  max={range.max}
                  step={range.step}
                  value={value.threshold}
                  onChange={(threshold) =>
                    setSignal(signal.name, { threshold })
                  }
                  labeled
                  debounceDelay={0}
                />
              </div>
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Secondary}
                style={{ width: 120 }}
              >
                {signal.kind === "hash"
                  ? `link if ≤ ${Math.round(value.threshold)} bits apart`
                  : `link if ≥ ${value.threshold.toFixed(2)} similar`}
              </Text>
              {form.fusion === "weighted" && (
                <div style={{ width: 130 }}>
                  <SingleValueSlider
                    min={0}
                    max={5}
                    step={0.5}
                    value={value.weight}
                    onChange={(weight) => setSignal(signal.name, { weight })}
                    knobLabel
                    bare
                    debounceDelay={0}
                  />
                </div>
              )}
            </Stack>
          );
        })}
      </Stack>

      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Lg}
        align={Align.Center}
      >
        <FormField
          label="Combine signals"
          control={
            <RadioGroup
              value={form.fusion}
              onChange={(v) => set({ fusion: v as Fusion })}
              options={FUSIONS}
            />
          }
        />
        {form.fusion === "weighted" && (
          <div style={{ flex: 1 }}>
            <FormField
              label="Link if weighted score ≥"
              description="Each signal is scaled to 0–1 (hashes: 1 − distance / bits)"
              control={
                <SingleValueSlider
                  min={0}
                  max={1}
                  step={0.01}
                  value={form.cutoff}
                  onChange={(cutoff) => set({ cutoff })}
                  labeled
                  debounceDelay={0}
                />
              }
            />
          </div>
        )}
      </Stack>

      <Disclosure
        label="Fields (optional): scoring, groups and direction"
        defaultOpen
      >
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Md}
          style={{ flexWrap: "wrap" }}
        >
          {FIELD_ROLES.map(({ role, label, description }) => (
            <div key={role} style={{ flex: "1 1 200px" }}>
              <FormField
                label={label}
                description={description}
                control={
                  <Select
                    exclusive
                    portal
                    options={fields}
                    value={form.fields[role] ?? NONE}
                    onChange={(v) => setField(role, v)}
                  />
                }
              />
            </div>
          ))}
        </Stack>
      </Disclosure>

      <Disclosure label="Advanced">
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Lg}
          align={Align.Center}
          style={{ flexWrap: "wrap" }}
        >
          <div style={{ width: 160 }}>
            <FormField
              label="Candidates per signal"
              control={
                <Input
                  size={Size.Sm}
                  type={InputType.Number}
                  value={String(form.top_k)}
                  onChange={(e) => set({ top_k: Number(e.target.value) })}
                />
              }
            />
          </div>
          <NeedsTime enabled={hasTime}>
            <Toggle
              size={Size.Sm}
              label="Earlier image is the parent"
              checked={hasTime && form.direction}
              disabled={!hasTime}
              onChange={(direction) => set({ direction })}
            />
          </NeedsTime>
          <NeedsTime
            enabled={hasTime && form.direction}
            reason={
              hasTime
                ? "Turn on 'Earlier image is the parent' first"
                : undefined
            }
          >
            <Toggle
              size={Size.Sm}
              label="One parent per image"
              checked={hasTime && form.direction && form.one_parent}
              disabled={!hasTime || !form.direction}
              onChange={(one_parent) => set({ one_parent })}
            />
          </NeedsTime>
          <div style={{ flex: 1, minWidth: 180 }}>
            <FormField
              label="Run name"
              control={
                <Input
                  size={Size.Sm}
                  placeholder="e.g. pHash OR CLIP"
                  value={form.run_name ?? ""}
                  onChange={(e) => set({ run_name: e.target.value })}
                />
              }
            />
          </div>
        </Stack>
      </Disclosure>

      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Md}
        align={Align.Center}
      >
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Xs}
          style={{ flex: 1 }}
        >
          <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
            Rule
          </Text>
          <Text style={{ fontFamily: "monospace" }}>
            {describeRule(form, signals)}
          </Text>
          {error && (
            <Text variant={TextVariant.Sm} color={TextColor.Failure}>
              {error}
            </Text>
          )}
        </Stack>
        <Button
          variant={Variant.Primary}
          leadingIcon={running ? IconName.Spinner : IconName.Enter}
          disabled={!!error || running}
          onClick={onRun}
        >
          {running ? "Running…" : "Run rule"}
        </Button>
      </Stack>
    </FormFieldGroup>
  );
}

function NeedsTime({
  enabled,
  reason = "Set a time field first",
  children,
}: {
  enabled: boolean;
  reason?: string;
  children: ReactNode;
}) {
  if (enabled) return <>{children}</>;
  return (
    <Tooltip content={<Text variant={TextVariant.Sm}>{reason}</Text>}>
      <div>{children}</div>
    </Tooltip>
  );
}
