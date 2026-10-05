import {
  Card,
  Heading,
  HeadingLevel,
  Orientation,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { ReactNode } from "react";

export default function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        <Stack orientation={Orientation.Row} spacing={Spacing.Md}>
          <Stack orientation={Orientation.Column} spacing={Spacing.Xs} style={{ flex: 1 }}>
            <Heading level={HeadingLevel.H4}>{title}</Heading>
            {subtitle && (
              <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                {subtitle}
              </Text>
            )}
          </Stack>
          {action}
        </Stack>
        {children}
      </Stack>
    </Card>
  );
}
