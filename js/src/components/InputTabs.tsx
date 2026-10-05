import {
  Button,
  EmptyState,
  IconName,
  Size,
  ToggleSwitch,
  ToggleSwitchVariant,
  Variant,
} from "@voxel51/voodo";
import React, { ReactNode } from "react";
import Section from "./Section";

export const SIGNALS_TAB = 0;
export const RULE_TAB = 1;

type Props = {
  index: number;
  onIndexChange: (index: number) => void;
  hasSignals: boolean;
  signalsForm: ReactNode;
  ruleForm: ReactNode;
};

export default function InputTabs({
  index,
  onIndexChange,
  hasSignals,
  signalsForm,
  ruleForm,
}: Props) {
  return (
    <Section title="Inputs">
      <ToggleSwitch
        variant={ToggleSwitchVariant.Soft}
        size={Size.Sm}
        index={index}
        onChange={onIndexChange}
        tabs={[
          {
            id: "signals",
            data: { label: "1. Compute signals", content: signalsForm },
          },
          {
            id: "rule",
            data: {
              label: "2. Run rule",
              content: hasSignals ? (
                ruleForm
              ) : (
                <EmptyState
                  icon={IconName.Embeddings}
                  title="No signals yet"
                  description="A rule needs at least one hash or embedding index to compare images with."
                >
                  <Button
                    variant={Variant.Primary}
                    size={Size.Sm}
                    onClick={() => onIndexChange(SIGNALS_TAB)}
                  >
                    Go to Compute signals
                  </Button>
                </EmptyState>
              ),
            },
          },
        ]}
      />
    </Section>
  );
}
