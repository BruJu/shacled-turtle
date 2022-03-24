import { EditorState, StateField } from "@codemirror/state"
import Ontology from "./ontology/index";
import * as n3 from "n3";
import * as RDF from "@rdfjs/types";

export type OntologyField = {
  onto: Ontology;
  
  changeOntology(store: RDF.DatasetCore): void;
}

const ontologyField = StateField.define<{ onto: Ontology }>({
  create() {
    return {
      onto: Ontology.make(new n3.Store())
    };
  },

  update(value, _) {
    return value;
  }
});


export default ontologyField;

/**
 * Change the ontology used by the given editor state
 * @param state The editor state
 * @param triples The triples that constitues the new ontology
 */
export function changeOntology(state: EditorState, triples: RDF.Quad[]): boolean {
  const theField = state.field(ontologyField, false);
  if (theField === undefined) {
    return false;
  }

  try {
    theField.onto = Ontology.make(new n3.Store(triples));
    return true;
  } catch(_) {
    return false;
  }
}
