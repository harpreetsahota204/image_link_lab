import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import CopyGraphView from "./CopyGraphView";
import { ensureTheme } from "./theme";

ensureTheme();

registerComponent({
  name: "CopyGraphView",
  label: "CopyGraphView",
  component: CopyGraphView,
  type: PluginComponentType.Component,
  activator: () => true,
});
