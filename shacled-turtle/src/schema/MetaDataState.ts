import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import Schema from ".";
import { addTermPairInTermMultiMap } from "../util";
import { MetaBaseInterface, MetaBaseInterfaceComponent } from "./MetaDataInterface";
import { TypesAndShapes } from "./SubDB-Suggestion";

/**
 * Storage for the metadata of a dataset. Metadata are defined as for each RDF
 * resource the list of its types and shapes it must conform to.
 * 
 * Stores the corresponding schema to also provide a function to call when
 * a new triple is added.
 */
export default class MetaDataState implements MetaBaseInterface {
  /** The schema related to this state */
  private readonly schema: Schema;
  readonly types: MetaBaseInterfaceComponent = new MetaDataStateComponent();
  readonly shapes: MetaBaseInterfaceComponent = new MetaDataStateComponent();

  constructor(schema: Schema) {
    this.schema = schema;
    schema.ruleset.addAxioms(this);
  }
  
  onNewTriple(quad: RDF.Quad, data: RDF.DatasetCore) {
    this.schema.ruleset.onNewTriple(quad, data, this);
  }

  getObjectsOfType(types: TypesAndShapes): TermSet<RDF.Term> {
    return new TermSet([
      ...this.types.getClassifiedAs(types.types),
      ...this.shapes.getClassifiedAs(types.shapes)
    ]);
  }
}

/**
 * Basic implementation for `MetaBaseInterfaceComponent` that uses a TermMap.
 */
export class MetaDataStateComponent implements MetaBaseInterfaceComponent {
  readonly data: TermMap<RDF.Term, TermSet> = new TermMap();
  readonly classifiedToTerm: TermMap<RDF.Term, TermSet> = new TermMap();

  add(resource: RDF.Term, classifier: RDF.Term): boolean {
    let classifiedAs = this.data.get(resource);
    if (classifiedAs === undefined) {
      classifiedAs = new TermSet();
      this.data.set(resource, classifiedAs);
    }
    
    if (classifiedAs.has(classifier)) return false;

    addTermPairInTermMultiMap(this.classifiedToTerm, classifier, resource);

    classifiedAs.add(classifier);
    return true;
  }
  
  getAll(resource: RDF.Term): TermSet<RDF.Term> {
    const classifiedAs = this.data.get(resource);
    return classifiedAs || new TermSet();
  }
  
  getClassifiedAs(list: Iterable<RDF.Term>): Iterable<RDF.Term> {
    let resources: RDF.Term[] = [];

    for (const classified of list) {
      const terms = this.classifiedToTerm.get(classified);
      if (terms !== undefined) {
        resources.push(...terms);
      }
    }
    
    return resources;
  }
}
