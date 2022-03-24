import { basicSetup } from "@codemirror/basic-setup";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { ns } from "./PRECNamespace";
import { shacledTurtle, changeOntology, ShacledTurtleOptions } from "shacled-turtle";
import axios from 'axios';
import * as n3 from "n3";

/**
 * A Code Editor backed by CodeMirror6 specialized in PREC Context writing.
 */
export default class ContextCodeEditor {
  readonly view: EditorView;

  /** Mount the code editor inside the given parent */
  constructor(parent: Element, extensions?: Extension[], options?: ShacledTurtleOptions) {
    this.view = new EditorView({
      parent: parent,
      state: EditorState.create({
        doc: initialDocument(),
        extensions: [
          basicSetup,
          placeholder("Your context"),
          shacledTurtle(options),
          ...(extensions || [])
        ]
      })
    });
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
    changeOntology(this.view.state, quads);
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
