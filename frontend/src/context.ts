import { EditorView } from "@codemirror/view";
import ContextCodeEditor from "./ctx-writing/ContextCodeEditor";
import { PREC_SHAPE_GRAPH_LINK } from "./ctx-writing/SuggestionDatabase";
import { changeShaclGraph } from "./ctx-writing/triples-autocompletion";

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

const input = document.getElementById("shape_url") as HTMLInputElement | null;

if (input !== null) {
  input.value = PREC_SHAPE_GRAPH_LINK;

  input.addEventListener('change', () => {
    input.classList.remove("is-success");
    input.classList.remove("is-danger");
  });
}

document.getElementById("shape_url_button")
?.addEventListener('click', async () => {
  if (input === null) return;

  const button = document.getElementById("shape_url_button")! as HTMLButtonElement;

  if (button.classList.contains("is-loading")) return;
  button.classList.add("is-loading");
  input.classList.remove("is-success");
  input.classList.remove("is-danger");

  const res = await changeShaclGraph(input.value);
  button.classList.remove("is-loading");

  if (res) {
    input.classList.add("is-success");
  } else {
    input.classList.add("is-danger");
  }
});

