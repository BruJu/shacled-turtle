import { EditorView } from "@codemirror/view";
import ContextCodeEditor from "./ctx-writing/ContextCodeEditor";
import { PREC_SHAPE_GRAPH_LINK } from "./ctx-writing/SuggestionDatabase";

const theme = EditorView.theme({
  "&": { height: "600px" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-content, .cm-gutter": { minHeight: "600px" }
});

  
new ContextCodeEditor(
  document.getElementById("editor")!,
  [theme]
);

document.getElementById("prec_shacl_graph")!
.setAttribute("href", PREC_SHAPE_GRAPH_LINK)
