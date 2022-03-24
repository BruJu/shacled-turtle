import { basicSetup } from "@codemirror/basic-setup";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { ns } from "./PRECNamespace";
import shacledTurtle, { DebugInformation } from "shacled-turtle";
import * as RDF from "@rdfjs/types";
import axios from 'axios';
import * as n3 from "n3";
import { termToString } from 'rdf-string';

/**
 * A Code Editor backed by CodeMirror6 specialized in PREC Context writing.
 */
export default class ContextCodeEditor {
  readonly view: EditorView;

  private readonly quadsToOntology: (triples: RDF.Quad[]) => void;

  /** Mount the code editor inside the given parent */
  constructor(parent: Element, extensions?: Extension[]) {
    const st = shacledTurtle({
      onDebugInfo: injectDebugInfoInDocument
    });

    this.view = new EditorView({
      parent: parent,
      state: EditorState.create({
        doc: initialDocument(),
        extensions: [
          basicSetup,
          placeholder("Your context"),
          st.shacledTurtleExtension,
          ...(extensions || [])
        ]
      })
    });

    this.quadsToOntology = st.changeOntology;
  }

  /**
   * Return the context written by the user as a string.
   */
  getContext(): string {
    return this.view.state.doc.toString();
  }

  async changeOntology(ontologyUrl: string): Promise<boolean> {
    const answer = await axios.get<string>(ontologyUrl);
    if (answer.status !== 200) {
      console.error("SuggestionDatabase::load: Error " + answer.status);
      return false;
    }

    const quads = new n3.Parser().parse(answer.data);
    this.quadsToOntology(quads);
    return true;
  }
}

function initialDocument() {
  let lines: string[] = [];

  for (const prefix of <const>["rdf", "rdfs", "xsd", "prec", "pvar", "pgo", "ex"]) {
    const builder = ns[prefix];
    if (builder !== undefined) {
      lines.push(`@prefix ${prefix}: <${builder[''].value}> .`);
    }
  }

  return lines.join("\n") + "\n\n";
}

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
