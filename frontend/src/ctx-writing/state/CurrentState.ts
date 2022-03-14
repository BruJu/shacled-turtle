import * as RDF from "@rdfjs/types";
import Ontology from "../../ontology/OntologyBuilder";
import DoubleDataset from "./DoubleDataset";
import DoubleMeta from "./DoubleMeta";

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

