// Types for the @fiftyone/* globals the App provides at runtime. The plugin
// build externalizes these packages, so they are not installed.

declare module "@fiftyone/plugins" {
  import type { FC } from "react";

  export enum PluginComponentType {
    Visualizer = 1,
    Plot = 2,
    Panel = 3,
    Component = 4,
  }

  export function registerComponent(options: {
    name: string;
    label: string;
    component: FC<any>;
    type: PluginComponentType;
    activator: (ctx?: unknown) => boolean;
  }): void;
}

declare module "@fiftyone/operators" {
  export function useTriggerPanelEvent(): (
    event: string,
    params?: Record<string, unknown>,
    prompt?: boolean,
    callback?: (result: unknown) => void,
  ) => void;
}

declare module "@fiftyone/spaces" {
  export function usePanelId(): string;
}

declare module "@fiftyone/state" {
  import type { RecoilValueReadOnly } from "recoil";

  export const datasetId: RecoilValueReadOnly<string | null>;
  export const datasetName: RecoilValueReadOnly<string | null>;
  export function getSampleSrc(url: string): string;
}

declare module "recoil" {
  export interface RecoilValueReadOnly<T> {
    readonly __tag: [T];
  }
  export function useRecoilValue<T>(value: RecoilValueReadOnly<T>): T;
}

declare module "@fiftyone/utilities" {
  export type EventSourceMessage = {
    id: string;
    event: string;
    data: string;
  };

  export function getEventSource(
    path: string,
    events: {
      onmessage?: (event: EventSourceMessage) => void;
      onopen?: () => void;
      onclose?: () => void;
      onerror?: (error: Error) => void;
    },
    signal: AbortSignal,
    body?: Record<string, unknown>,
  ): void;
}
