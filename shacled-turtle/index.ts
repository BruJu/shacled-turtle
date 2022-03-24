import { turtle } from "@bruju/lang-turtle";
import { Extension } from "@codemirror/state";
import { autocompletion } from "@codemirror/autocomplete";
import autocompletionSolve from "./src/autocompletion-solving";
import ontologyField, { changeOntology } from "./src/StateField-CurrentOntology";
export { changeOntology }

/**
 * The Shacled Turtle extension. It provides:
 * - Turtle syntaxic coloration
 * - The ability to provide autocompletion suggestion based on an ontology
 * graph.
 * 
 * The ontology graph must be loaded by calling 
 * `changeOntology(view.state, theOntologyTriples)`
 * with `view` the EditorView of your CodeMirror editor and `theOntologyTriples`
 * a list of RDF/JS quads in the default graph that describes your ontology.
 * 
 * Ontology can be written by using RDFS, SHACL, schema:domainIncludes or a mix
 * of these.
 */
export default function shacledTurtle(
  options: ShacledTurtleOptions = {}
): Extension {
  return [
    turtle(),
    ontologyField.extension,
    autocompletion({ override: [ autocompletionSolve(options?.onDebugInfo) ] }),
  ];
}

export { shacledTurtle };

export type ShacledTurtleOptions = {
  onDebugInfo?: (debug: DebugInformation) => void
}

import DebugInformation from "./src/DebugInformation";
export { DebugInformation };
