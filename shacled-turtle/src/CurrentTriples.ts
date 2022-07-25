import * as RDF from "@rdfjs/types";
import Schema from "./schema";
import MetaBase from "./schema/MetaBase";
import * as n3 from "n3";

/**
 * The triples of a current state, with all meta information = inferred
 * types and shapes for all resources in the dataset.
 */
export default class CurrentTriples {
  readonly schema: Schema;
  readonly completeTriples = new n3.Store();
  readonly metaBase: MetaBase;

  stableUntil: number = 0;

  constructor(schema: Schema) {
    this.schema = schema;
    this.metaBase = new MetaBase(this.schema);
  }

  add(triple: RDF.Quad): void {
    this.completeTriples.add(triple);
    this.schema.ruleset.onNewTriple(triple, this.completeTriples, this.metaBase);
  }  
}

