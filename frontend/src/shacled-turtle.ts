import { EditorView } from "@codemirror/view";
import ContextCodeEditor from "./ContextCodeEditor";
import { PREC_SHAPE_GRAPH_LINK } from "./things";

const theme = EditorView.theme({
  "&": { height: "600px" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-content, .cm-gutter": { minHeight: "600px" }
});

  
const ctxEditor = new ContextCodeEditor(
  document.getElementById("editor")!, [theme]
);

ctxEditor.changeOntology(PREC_SHAPE_GRAPH_LINK);

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

  const res = await ctxEditor.changeOntology(input.value);
  button.classList.remove("is-loading");

  if (res) {
    input.classList.add("is-success");
  } else {
    input.classList.add("is-danger");
  }
});

