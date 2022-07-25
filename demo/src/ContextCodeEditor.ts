import { basicSetup } from "@codemirror/basic-setup";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { shacledTurtle, changeSchema, ShacledTurtleOptions } from "shacled-turtle";
import axios from 'axios';
import * as n3 from "n3";
import namespace from '@rdfjs/namespace';

const N3Factory = { factory: n3.DataFactory };

const ns = {
  rdf : namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", N3Factory),
  rdfs: namespace("http://www.w3.org/2000/01/rdf-schema#"      , N3Factory),
  xsd : namespace("http://www.w3.org/2001/XMLSchema#"          , N3Factory),
  ex  : namespace("http://www.example.org/"                    , N3Factory),
  sh  : namespace("http://www.w3.org/ns/shacl#"                , N3Factory)
};


/**
 * A Code Editor backed by CodeMirror6 specialized in PREC Context writing.
 */
export default class ContextCodeEditor {
  readonly view: EditorView;

  /** Mount the code editor inside the given parent */
  constructor(
    parent: Element,
    extensions?: Extension[],
    options?: ShacledTurtleOptions,
    initialText = initialDocument()
  ) {
    this.view = new EditorView({
      parent: parent,
      state: EditorState.create({
        doc: initialText,
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

  async changeSchema(schemaUrl: string): Promise<boolean> {
    try {
      const answer = await axios.get<string>(schemaUrl);
      
      if (answer.status !== 200) {
        console.error("SuggestionDatabase::load: Error " + answer.status);
        return false;
      }

      const quads = new n3.Parser().parse(answer.data);
      changeSchema(this.view.state, quads);
      return true;
    } catch (err) {
      console.error("SuggestionDatabase::load: Error " + err);
      return false;
    }
  }
}

export function initialDocument() {
  let lines: string[] = [];

  for (const prefix of <const>["rdf", "rdfs", "xsd", "ex"]) {
    const builder = ns[prefix];
    if (builder !== undefined) {
      lines.push(`@prefix ${prefix}: <${builder[''].value}> .`);
    }
  }

  return lines.join("\n") + "\n\n";
}
