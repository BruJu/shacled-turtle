import { turtle } from "@bruju/lang-turtle";
import { Extension } from "@codemirror/state";
import { autocompletion } from "@codemirror/autocomplete";
import autocompletionSolve from "./src/autocompletion-solving";
import shacledTurtleField, { changeSchema } from "./src/StateField";
export { changeSchema };
import parseDocument from "./src/FullParser";
export { parseDocument };
import lint from "./src/error-detection";

/**
 * The Shacled Turtle extension. It provides:
 * - Turtle syntaxic coloration
 * - The ability to provide autocompletion suggestion based on an schema graph.
 * 
 * The schema graph must be loaded by calling 
 * `changeSchema(view.state, theSchemaTriples)`
 * with `view` the EditorView of your CodeMirror editor and `theSchemaTriples`
 * a list of RDF/JS quads in the default graph that describes your schema.
 * 
 * Schema can be written by using RDFS, SHACL, schema:domainIncludes or a mix
 * of these.
 */
export default function shacledTurtle(
  options: ShacledTurtleOptions = {}
): Extension {
  let extensions = [
    turtle(),
    shacledTurtleField.extension,
    autocompletion({ override: [ autocompletionSolve(options) ] })
  ];

  if (options.displayErrors !== false) {
    extensions.push(lint);
  }

  return extensions;
}

export { shacledTurtle };

export type ShacledTurtleOptions = {
  /** Function called when debug information are changed */
  onDebugInfo?: (debug: DebugInformation) => void,
  /** Use prefix.cc to provide prefixes autocompletion. Default = true */
  usePrefixCC?: boolean,
  /** Display errors. Error detection is currently very basic. Default = true */
  displayErrors?: boolean;
}

import DebugInformation from "./src/DebugInformation";
export { DebugInformation };
