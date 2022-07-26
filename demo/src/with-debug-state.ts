import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { DebugInformation, ShacledTurtleOptions } from "shacled-turtle";
import { termToString } from "rdf-string";
import ContextCodeEditor from "./ContextCodeEditor";
import * as n3 from "n3";
import namespace from '@rdfjs/namespace';

const N3Factory = { factory: n3.DataFactory };

function makeInitialTextForPrec() {

  const ns = {
    rdf : namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", N3Factory),
    rdfs: namespace("http://www.w3.org/2000/01/rdf-schema#"      , N3Factory),
    xsd : namespace("http://www.w3.org/2001/XMLSchema#"          , N3Factory),
    ex  : namespace("http://www.example.org/"                    , N3Factory),
    pgo : namespace("http://ii.uwb.edu.pl/pgo#"                  , N3Factory),
    prec: namespace("http://bruy.at/prec#"                       , N3Factory),
  };

  let lines: string[] = [];

  for (const [prefix, builder] of Object.entries(ns)) {
    lines.push(`@prefix ${prefix}: <${builder[''].value}> .`);
  }

  return lines.join("\n") + "\n\n";
}

function makeFlexibleTurtleEditor(
  editorRoot: HTMLElement,
  urlTextBox: HTMLInputElement,
  validationButton: HTMLButtonElement,
  defaultShape: string | null = null,
  extraExtensions: Extension[] = [],
  stOptions?: ShacledTurtleOptions
) {
  // Initialize values
  const editor = new ContextCodeEditor(editorRoot, extraExtensions, stOptions,
    makeInitialTextForPrec()
    );

  // Load context
  if (defaultShape === null) {
    urlTextBox.value = "";
  } else {
    urlTextBox.value = defaultShape;
    editor.changeSchema(defaultShape);
  }

  // Add listeners
  urlTextBox.addEventListener('change', () => {
    urlTextBox.classList.remove("is-success");
    urlTextBox.classList.remove("is-danger");
  });

  validationButton.addEventListener('click', async () => { 
    if (validationButton.classList.contains("is-loading")) return;
    validationButton.classList.add("is-loading");
    validationButton.classList.remove("is-success");
    validationButton.classList.remove("is-danger");
  
    const res = await editor.changeSchema(urlTextBox.value);
    validationButton.classList.remove("is-loading");
  
    if (res) {
      urlTextBox.classList.add("is-success");
    } else {
      urlTextBox.classList.add("is-danger");
    }
  });

  return editor;
}


/** The PREC validation shape graph */
export const PREC_SHAPE_GRAPH_LINK = "https://raw.githubusercontent.com/BruJu/PREC/ContextShape/data/PRECContextShape.ttl";

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

  const obj = document.getElementById("current_object_types");
  if (obj !== null) {
    let txt: string;
    if (debugInfo.object !== null) {
      txt = "Types=["
        + debugInfo.object.types.map(term => termToString(term)).join(", ") + "]"
        + " Shapes=["
        + debugInfo.object.shapes.map(term => termToString(term)).join(", ") + "]";
    } else {
      txt = "";
    }

    obj.innerHTML = "";
    obj.appendChild(document.createTextNode(txt));
  }
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
