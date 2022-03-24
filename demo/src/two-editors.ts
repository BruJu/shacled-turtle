import { EditorView } from "@codemirror/view";
import makeFlexibleTurtleEditor from "./ShacledTurtleEditor-Flexible";
import { PREC_SHAPE_GRAPH_LINK } from "./things";

const theme = EditorView.theme({
  "&": { height: "600px" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-content, .cm-gutter": { minHeight: "600px" }
});


makeFlexibleTurtleEditor(
  document.getElementById("editor1")!,
  document.getElementById("shape_url_1")! as HTMLInputElement,
  document.getElementById("shape_url_button_1")! as HTMLButtonElement,
  PREC_SHAPE_GRAPH_LINK,
  [theme]
);

makeFlexibleTurtleEditor(
  document.getElementById("editor2")!,
  document.getElementById("shape_url_2")! as HTMLInputElement,
  document.getElementById("shape_url_button_2")! as HTMLButtonElement,
  "https://gist.githubusercontent.com/BruJu/3bca354ba25fa9b91d1c00a9f9d1b06e/raw/ca5b85ea7f9731efc1490555ad8d43b6feb0358a/OneStepBackward.ttl",
  [theme]
);
