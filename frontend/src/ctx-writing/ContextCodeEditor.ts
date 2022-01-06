import { turtle } from "@bruju/lang-turtle";
import { autocompletion } from "@codemirror/autocomplete";
import { basicSetup } from "@codemirror/basic-setup";
import { EditorState } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { ns } from "../PRECNamespace";
import autocompletionSolve from "./autocompletion-solving";

/**
 * A Code Editor backed by CodeMirror6 specialized in PREC Context writing.
 */
export default class ContextCodeEditor {
  readonly view: EditorView;

  /** Mount the code editor inside the given parent */
  constructor(parent: Element) {
    this.view = new EditorView({
      parent: parent,
      state: EditorState.create({
        doc: "",
        extensions: [
          basicSetup,
          placeholder("Your context"),
          turtle(),
          autocompletion({ override: [ autocompletionSolve ] })
        ]
      })
    });
  }

  /**
   * Return the context written by the user as a string. Some PREC related
   * namespaces are added.
   */
  getContext(): string {
    const viewContent = this.view.state.doc.toString();
    if (viewContent === '') return '';

    // Append PREC related prefixes
    return Object.entries(ns).map(([prefix, namedNode]) => {
      return `@prefix ${prefix}: <${namedNode[''].value}> .`
    }).join("\n") + "\n" + viewContent;
  }
}
