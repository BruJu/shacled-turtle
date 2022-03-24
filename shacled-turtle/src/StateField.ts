import { EditorState, StateField } from "@codemirror/state"
import Schema from "./schema/index";
import * as n3 from "n3";
import * as RDF from "@rdfjs/types";

/**
 * Data persisted by Shacled Turtle
 */
export type ShacledTurtleField = {
  /** Schema currently used by the state */
  schema: Schema;
}

/**
 * `StateField` for Shacled Turtle data.
 */
const shacledTurtleField = StateField.define<ShacledTurtleField>({
  create() {
    return {
      schema: Schema.make(new n3.Store())
    };
  },

  update(value, _) {
    return value;
  }
});


export default shacledTurtleField;

/**
 * Change the RDF schema used by the given editor state
 * @param state The editor state
 * @param triples The triples that constitues the new schema
 */
export function changeSchema(state: EditorState, triples: RDF.Quad[]): boolean {
  const theField = state.field(shacledTurtleField, false);
  if (theField === undefined) {
    return false;
  }

  try {
    theField.schema = Schema.make(new n3.Store(triples));
    return true;
  } catch(_) {
    return false;
  }
}
