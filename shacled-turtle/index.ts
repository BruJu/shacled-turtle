import * as RDF from "@rdfjs/types";
import { turtle } from "@bruju/lang-turtle";
import { Extension } from "@codemirror/state";
import { autocompletion } from "@codemirror/autocomplete";
import autocompletionSolve from "./src/autocompletion-solving";
import { changeShaclGraph } from "./src/triples-autocompletion";

export type ShacledTurtle = {
  /** The code mirror extension */
  shacledTurtleExtension: Extension;
  changeOntology(triples: RDF.Quad[]): void;
};

export default function shacledTurtle(
  options: ShacledTurtleOptions = {}
): ShacledTurtle {
  return {
    shacledTurtleExtension: [
      turtle(),
      autocompletion({ override: [ autocompletionSolve(options?.onDebugInfo) ] }),
    ],
    changeOntology: (triples: RDF.Quad[]) => {
      changeShaclGraph(triples);
    }
  };
}

export type ShacledTurtleOptions = {
  onDebugInfo?: (debug: DebugInformation) => void
}

import DebugInformation from "./src/DebugInformation";
export { DebugInformation };
