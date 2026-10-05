import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import LinkLabView from "./LinkLabView";
import { ensureTheme } from "./theme";

ensureTheme();

registerComponent({
  name: "LinkLabView",
  label: "LinkLabView",
  component: LinkLabView,
  type: PluginComponentType.Component,
  activator: () => true,
});
