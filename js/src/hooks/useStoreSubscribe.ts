import { getEventSource } from "@fiftyone/utilities";
import { useEffect, useRef } from "react";

const SUBSCRIBE_PATH = "/operators/subscribe-execution-store";

/**
 * Subscribes to changes in an execution store over server-sent events.
 *
 * The App's own `useExecutionStoreSubscribe` lives in `@fiftyone/core`, which
 * the App doesn't share with plugin bundles.
 */
export function useStoreSubscribe({
  operatorUri,
  datasetId,
  datasetName,
  onChange,
}: {
  operatorUri: string;
  datasetId?: string | null;
  datasetName?: string | null;
  onChange: (key: string, value: unknown) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!datasetId) return;

    const controller = new AbortController();
    try {
      getEventSource(
        SUBSCRIBE_PATH,
        {
          onmessage: (event) => {
            if (event.event === "ping" || !event.data) return;
            try {
              const { key, value } = JSON.parse(event.data);
              onChangeRef.current(key, value);
            } catch (error) {
              console.error("Image Link Lab: bad store event", error);
            }
          },
          onerror: (error) => {
            console.error("Image Link Lab: store subscription error", error);
          },
        },
        controller.signal,
        {
          dataset_id: datasetId,
          dataset_name: datasetName,
          operator_uri: operatorUri,
        },
      );
    } catch (error) {
      console.error("Image Link Lab: failed to subscribe", error);
    }

    return () => controller.abort();
  }, [operatorUri, datasetId, datasetName]);
}
