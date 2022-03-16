import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import Ontology from "./OntologyBuilder";
import { MetaBaseInterface, MetaBaseInterfaceComponent } from "./Ruleset";

export default class MetaDataState implements MetaBaseInterface {
  private readonly ontology: Ontology;
  readonly types: MetaBaseInterfaceComponent = new MetaDataStateComponent();
  readonly shapes: MetaBaseInterfaceComponent = new MetaDataStateComponent();

  constructor(ontology: Ontology) {
    this.ontology = ontology;
    ontology.ruleset.addAxioms(this);
  }
  
  onNewTriple(quad: RDF.Quad, data: RDF.DatasetCore) {
    this.ontology.ruleset.onNewTriple(quad, data, this);
  }
}

export class MetaDataStateComponent implements MetaBaseInterfaceComponent {
  readonly data: TermMap<RDF.Term, TermSet> = new TermMap();

  add(resource: RDF.Term, classifier: RDF.Term): boolean {
    let classifiedAs = this.data.get(resource);
    if (classifiedAs === undefined) {
      classifiedAs = new TermSet();
      this.data.set(resource, classifiedAs);
    }
    
    if (classifiedAs.has(classifier)) return false;

    classifiedAs.add(classifier);
    return true;
  }
  
  getAll(resource: RDF.Term): TermSet<RDF.Term> {
    const classifiedAs = this.data.get(resource);
    return classifiedAs || new TermSet();
  }
}
