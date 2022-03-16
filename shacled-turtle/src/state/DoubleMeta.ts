import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import { MetaBaseInterface, MetaBaseInterfaceComponent } from "../ontology/MetaDataInterface";
import { MetaDataStateComponent } from "../ontology/MetaDataState";

/**
 * A meta base implementation that uses two different storage: one unstable and
 * one stable.
 * 
 * New elements are added to the unstable part. It is possible to transfer
 * all unstable to the stable part, clear only the unstable part or clear
 * both parts.
 */
export default class DoubleMeta implements MetaBaseInterface {
  types: DoubleComponent = new DoubleComponent();
  shapes: DoubleComponent = new DoubleComponent();

  stabilize() {
    this.types.stabilize();
    this.shapes.stabilize();
  }

  clearUnstable() {
    this.types.clearUnstable();
    this.shapes.clearUnstable();
  }

  clearBoth() {
    this.types.clearBoth();
    this.shapes.clearBoth();
  }
}

/**
 * A storage for a mapping resource -> classifiers with two parts: one part
 * considered stable and one considered unstable. New classification are added
 * into the unstable part and it is possible to transfer all unstable parts
 * into the stable part.
 */
export class DoubleComponent implements MetaBaseInterfaceComponent {
  stable: MetaDataStateComponent = new MetaDataStateComponent();
  unstable: MetaDataStateComponent = new MetaDataStateComponent();

  add(resource: RDF.Term, classifier: RDF.Term): boolean {
    return this.unstable.add(resource, classifier);
  }

  getAll(resource: RDF.Term): TermSet<RDF.Term> {
    const stable = this.stable.getAll(resource);
    const unstable = this.unstable.getAll(resource);

    if (stable.size === 0) return unstable;
    if (unstable.size === 0) return stable;

    return new TermSet([...stable, ...unstable]);
  }

  stabilize() {
    for (const [key, values] of this.unstable.data) {
      values.forEach(value => this.stable.add(key, value));
    }
    this.clearUnstable();
  }

  clearBoth() {
    this.stable.data.clear();
    this.unstable.data.clear();
  }

  clearUnstable() {
    this.unstable.data.clear();
  }
}


