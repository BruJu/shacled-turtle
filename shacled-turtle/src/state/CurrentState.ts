import * as RDF from "@rdfjs/types";
import Schema from "../schema";
import DoubleDataset from "./DoubleDataset";
import DoubleMeta from "./DoubleMeta";

/**
 * The triples of a current state, with all meta information = inferred
 * types and shapes for all resources in the dataset.
 */
export default class CurrentTriples {
  readonly schema: Schema;
  readonly dataset: DoubleDataset = new DoubleDataset();
  readonly meta: DoubleMeta = new DoubleMeta();

  stableUntil: number = 0;

  constructor(schema: Schema) {
    this.schema = schema;
  }

  add(triple: RDF.Quad): void {
    this.dataset.add(triple);
    this.schema.ruleset.onNewTriple(triple, this.dataset, this.meta);
  }  
}

