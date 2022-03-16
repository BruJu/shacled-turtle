import * as RDF from "@rdfjs/types";
import { turtle } from "@bruju/lang-turtle";
import { Extension } from "@codemirror/state";
import { autocompletion } from "@codemirror/autocomplete";
import autocompletionSolve from "./src/autocompletion-solving";
import { changeShaclGraph } from "./src/triples-autocompletion";

export type ShacledTurtle = {
  /** The code mirror extension */
  extension: Extension;
  changeContext(triples: RDF.Quad[]): void;
};

export default function shacledTurtle(
  onDebugInfo?: (debug: DebugInformation) => void
): ShacledTurtle {
  return {
    extension: [
      turtle(),
      autocompletion({ override: [ autocompletionSolve(onDebugInfo) ] }),
    ],
    changeContext: (triples: RDF.Quad[]) => {
      changeShaclGraph(triples);
    }
  };
}

import DebugInformation from "./src/DebugInformation";
export { DebugInformation };
