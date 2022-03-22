import * as RDF from "@rdfjs/types";
import * as n3 from "n3";
import OntologyBuilder from "./builder";
import MetaDataState from "./MetaDataState";
import InferenceDatabase from "./SubDB-Inference";
import SuggestionDatabase, { Suggestion } from './SubDB-Suggestion';

// Term suggestion database that resorts to a SHACL shape graph.

// A SHACL shape graph is supposed to be used to validate an RDF graph. The
// specification also gives building forms as an example.
//
// Here, we use the shape graph to power up an autocompletion engine ?

/**
 * A loaded ontology used for autocompletion
 * 
 * A database used to suggest some terms for auto completion, backed by a SHACL
 * graph.
 */
export default class Ontology {
  readonly ruleset: InferenceDatabase;
  readonly suggestible: SuggestionDatabase;

  constructor(ruleset: InferenceDatabase, suggestible: SuggestionDatabase) {
    this.ruleset = ruleset;
    this.suggestible = suggestible;
  }

  static make(store: RDF.DatasetCore): Ontology {
    const builder = new OntologyBuilder();
    builder.addRDFS(store);
    builder.addSHACL(store);
    return builder.build();
  }

  /**
   * Return every type for which we have some information about the predicate it
   * uses
   */
   getAllTypes(): Suggestion[] {
    return this.suggestible.getTypes();
  }
}
