import { EditorView } from "@codemirror/view";
import { PREC_SHAPE_GRAPH_LINK } from "./things";
import makeFlexibleTurtleEditor from "./ShacledTurtleEditor-Flexible";
import { DebugInformation } from "shacled-turtle";
import { termToString } from "rdf-string";

const theme = EditorView.theme({
  "&": { height: "600px" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-content, .cm-gutter": { minHeight: "600px" }
});

function injectDebugInfoInDocument(debugInfo: DebugInformation) {
  const pathEl = document.getElementById('current_path');
  if (pathEl === null) return;
  
  const subjectEl = document.getElementById('current_subject')!;
  const typesEl = document.getElementById('current_subject_types')!;

  pathEl.innerHTML = "";
  subjectEl.innerHTML = "";
  typesEl.innerHTML = "";

  pathEl.appendChild(document.createTextNode(debugInfo.hierarchy));

  let subjectDisplay: string;
  let typesText: string;
  if (debugInfo.subject !== null) {
    subjectDisplay = debugInfo.subject.text;
    subjectDisplay += " -> " + termToString(debugInfo.subject.term);

    typesText = "Types=["
      + debugInfo.subject.types.map(term => termToString(term)).join(", ") + "]"
      + " Shapes=["
      + debugInfo.subject.shapes.map(term => termToString(term)).join(", ") + "]";
  } else {
    subjectDisplay = "No subject";
    typesText = "";
  }

  subjectEl.appendChild(document.createTextNode(subjectDisplay));  
  typesEl.appendChild(document.createTextNode(typesText));
}


makeFlexibleTurtleEditor(
  document.getElementById("editor")!,
  document.getElementById("shape_url")! as HTMLInputElement,
  document.getElementById("shape_url_button")! as HTMLButtonElement,
  PREC_SHAPE_GRAPH_LINK,
  [theme],
  {
    onDebugInfo: injectDebugInfoInDocument
  }
);

document.getElementById("prec_shacl_graph")!
.setAttribute("href", PREC_SHAPE_GRAPH_LINK)
