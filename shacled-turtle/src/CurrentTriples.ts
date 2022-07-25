import * as RDF from "@rdfjs/types";
import Schema from "./schema";
import MetaDataState from "./schema/MetaDataState";
import * as n3 from "n3";

/**
 * The triples of a current state, with all meta information = inferred
 * types and shapes for all resources in the dataset.
 */
export default class CurrentTriples {
  readonly schema: Schema;
  readonly completeTriples = new n3.Store();
  readonly metaBase: MetaDataState;

  stableUntil: number = 0;

  constructor(schema: Schema) {
    this.schema = schema;
    this.metaBase = new MetaDataState(this.schema);
  }

  add(triple: RDF.Quad): void {
    this.completeTriples.add(triple);
    this.schema.ruleset.onNewTriple(triple, this.completeTriples, this.metaBase);
  }  
}

