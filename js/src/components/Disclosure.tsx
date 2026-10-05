import {
  Align,
  Clickable,
  Collapsible,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextVariant,
} from "@voxel51/voodo";
import React, { ReactNode } from "react";

export default function Disclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      header={({ open, toggle }) => (
        <Clickable onClick={toggle}>
          <Stack orientation={Orientation.Row} align={Align.Center} spacing={Spacing.Sm}>
            <Icon name={open ? IconName.ChevronBottom : IconName.ChevronRight} size={Size.Sm} />
            <Text variant={TextVariant.Label}>{label}</Text>
          </Stack>
        </Clickable>
      )}
    >
      <div style={{ paddingTop: 8 }}>{children}</div>
    </Collapsible>
  );
}
