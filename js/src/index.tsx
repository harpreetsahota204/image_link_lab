import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import ImageLinkLabView from "./ImageLinkLabView";
import { ensureTheme } from "./theme";

ensureTheme();

registerComponent({
  name: "ImageLinkLabView",
  label: "ImageLinkLabView",
  component: ImageLinkLabView,
  type: PluginComponentType.Component,
  activator: () => true,
});
