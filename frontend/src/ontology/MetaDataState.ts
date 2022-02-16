import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import { getWithDefaultInTermMultiMap } from "../util";
import { MetaBaseInterface, MetaBaseInterfaceComponent } from "./Ruleset";

export default class MetaDataState implements MetaBaseInterface {
  readonly types: MetaBaseInterfaceComponent = new MetaDataStateComponent();
  readonly shapes: MetaBaseInterfaceComponent = new MetaDataStateComponent();
}

export class MetaDataStateComponent implements MetaBaseInterfaceComponent {
  readonly data: TermMap<RDF.Term, TermSet> = new TermMap();

  add(resource: RDF.Term, classifier: RDF.Term): boolean {
    const classifiedAs = getWithDefaultInTermMultiMap(this.data, resource);
    if (classifiedAs.has(classifier)) return false;

    classifiedAs.add(classifier);
    return true;
  }
  
  getAll(resource: RDF.Term): TermSet<RDF.Term> {
    const classifiedAs = this.data.get(resource);
    return classifiedAs || new TermSet();
  }
}
