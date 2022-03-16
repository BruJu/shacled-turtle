import * as RDF from "@rdfjs/types";
import Ontology from "../ontology";
import DoubleDataset from "./DoubleDataset";
import DoubleMeta from "./DoubleMeta";

/**
 * The triples of a current state, with all meta information = inferred
 * types and shapes for all resources in the dataset.
 */
export default class CurrentTriples {
  readonly ontology: Ontology;
  readonly dataset: DoubleDataset = new DoubleDataset();
  readonly meta: DoubleMeta = new DoubleMeta();

  stableUntil: number = 0;

  constructor(ontology: Ontology) {
    this.ontology = ontology;
  }

  add(triple: RDF.Quad): void {
    this.dataset.add(triple);
    this.ontology.ruleset.onNewTriple(triple, this.dataset, this.meta);
  }  
}

