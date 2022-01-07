import { turtle } from "@bruju/lang-turtle";
import { autocompletion } from "@codemirror/autocomplete";
import { basicSetup } from "@codemirror/basic-setup";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { ns } from "../PRECNamespace";
import autocompletionSolve from "./autocompletion-solving";

/**
 * A Code Editor backed by CodeMirror6 specialized in PREC Context writing.
 */
export default class ContextCodeEditor {
  readonly view: EditorView;

  /** Mount the code editor inside the given parent */
  constructor(parent: Element, extensions?: Extension[]) {
    this.view = new EditorView({
      parent: parent,
      state: EditorState.create({
        doc: initialDocument(),
        extensions: [
          basicSetup,
          placeholder("Your context"),
          turtle(),
          autocompletion({ override: [ autocompletionSolve ] }),
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
}


function initialDocument() {
  let lines: string[] = [];

  for (const prefix of ["rdf", "rdfs", "xsd", "prec", "pvar", "pgo", "ex"]) {
    const builder = (ns as any)[prefix];
    if (builder !== undefined) {
      lines.push(`@prefix ${prefix}: <${builder[''].value}> .`);
    }
  }

  return lines.join("\n") + "\n\n";
}
