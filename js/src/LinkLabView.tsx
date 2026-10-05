import * as fos from "@fiftyone/state";
import { Orientation, Spacing, Stack } from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import Evidence from "./components/Evidence";
import InputTabs, { RULE_TAB, SIGNALS_TAB } from "./components/InputTabs";
import Results from "./components/Results";
import RuleForm from "./components/RuleForm";
import RunList from "./components/RunList";
import SignalsForm from "./components/SignalsForm";
import { usePanelClient } from "./hooks/usePanelClient";
import { usePersistentState } from "./hooks/usePersistentState";
import { useStoreSubscribe } from "./hooks/useStoreSubscribe";
import type {
  LinkForm,
  PanelData,
  PanelMethods,
  SignalsForm as SignalsFormValues,
  SignalsProgress,
} from "./types";
import { buildRunParams, DEFAULT_SIGNALS_FORM, mergeSignals } from "./utils";

const NOTIFIER_URI = "@harpreetsahota/image_link_lab/link_lab_store_notifier";

type Props = {
  data: PanelData;
  schema: { view: PanelMethods & Record<string, unknown> };
};

export default function LinkLabView({ data, schema }: Props) {
  const call = usePanelClient(schema.view);
  const datasetId = useRecoilValue(fos.datasetId);
  const datasetName = useRecoilValue(fos.datasetName);

  const signals = data?.signals ?? [];
  const [chosenTab, setChosenTab] = usePersistentState<number | null>("tab", null);
  const [form, setForm] = usePersistentState<LinkForm | null>("rule_form", null);
  const [signalsForm, setSignalsForm] = usePersistentState<SignalsFormValues>(
    "signals_form",
    DEFAULT_SIGNALS_FORM,
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SignalsProgress | null>(null);

  // Until the user picks a tab, open where the work is
  const tab = chosenTab ?? (signals.length ? RULE_TAB : SIGNALS_TAB);

  // The saved form only fills an empty form, so edits survive a re-mount
  useEffect(() => {
    if (data?.form && form === null) setForm(data.form);
  }, [data?.form, form, setForm]);

  // Each clone is applied once, even across re-mounts
  const [appliedClone, setAppliedClone] = usePersistentState<string | null>(
    "applied_clone",
    null,
  );
  useEffect(() => {
    const clone = data?.clone_form;
    if (!clone || clone.nonce === appliedClone) return;
    const { nonce, ...cloned } = clone;
    setAppliedClone(nonce);
    setForm(cloned);
    setChosenTab(RULE_TAB);
  }, [data?.clone_form, appliedClone, setAppliedClone, setForm, setChosenTab]);

  useEffect(() => {
    setProgress(data?.signals_progress ?? null);
  }, [data?.signals_progress]);

  const mergedForm = useMemo(
    () => (form ? { ...form, signals: mergeSignals(signals, form.signals) } : null),
    [form, signals],
  );

  const onStoreChange = useCallback(
    (key: string, value: unknown) => {
      if (key === "signals:progress") {
        setProgress(value as SignalsProgress);
      } else if (key.startsWith("signals:")) {
        call("refresh");
      } else {
        call("list_runs");
      }
    },
    [call],
  );
  useStoreSubscribe({
    operatorUri: NOTIFIER_URI,
    datasetId,
    datasetName,
    onChange: onStoreChange,
  });

  const onRun = useCallback(async () => {
    if (!mergedForm) return;
    setRunning(true);
    try {
      await call("run_rule", {
        params: buildRunParams(mergedForm, signals),
        form: mergedForm,
      });
    } finally {
      setRunning(false);
    }
  }, [call, mergedForm, signals]);

  const onCompute = useCallback(() => {
    setProgress({
      state: signalsForm.delegate ? "queued" : "running",
      progress: 0,
      label: signalsForm.delegate ? "Waiting for the orchestrator" : "Starting",
    });
    call("compute_signals", { params: signalsForm });
  }, [call, signalsForm]);

  const run = data?.active_run ?? null;

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 12, boxSizing: "border-box" }}>
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        <InputTabs
          index={tab}
          onIndexChange={setChosenTab}
          hasSignals={signals.length > 0}
          signalsForm={
            <SignalsForm
              form={signalsForm}
              onChange={setSignalsForm}
              signals={signals}
              scopeOptions={data?.scope_options ?? []}
              embeddingModels={data?.embedding_models ?? []}
              progress={progress}
              onCompute={onCompute}
            />
          }
          ruleForm={
            mergedForm && (
              <RuleForm
                form={mergedForm}
                onChange={setForm}
                signals={signals}
                scopeOptions={data?.scope_options ?? []}
                fieldOptions={data?.field_options ?? []}
                running={running}
                onRun={onRun}
              />
            )
          }
        />

        {run && (
          <Results
            run={run}
            onOpenMisses={(row, group) =>
              call("open_misses", { run_id: run.run_id, row, group })
            }
            onShowQueries={() => call("show_queries", { run_id: run.run_id })}
          />
        )}

        {run && (
          <Evidence
            evidence={data?.evidence}
            onShowInGrid={(sampleId) =>
              call("open_links", { run_id: run.run_id, sample_id: sampleId })
            }
          />
        )}

        <RunList
          runs={data?.runs ?? []}
          activeRunId={run?.run_id}
          onApply={(runId) => call("apply_run", { run_id: runId })}
          onClone={(runId) => call("clone_run", { run_id: runId })}
          onRename={(runId, name) => call("rename_run", { run_id: runId, new_name: name })}
          onDelete={(runId) => call("delete_run", { run_id: runId })}
        />
      </Stack>
    </div>
  );
}
