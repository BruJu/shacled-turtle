import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import * as RDF from '@rdfjs/types';
import { getWithDefaultInTermMultiMap } from '../../util';
import { NodePosition } from './types';

export default class AutomataStateInitializer {
  readonly axiomTypes: TermMap<RDF.Term, TermSet> = new TermMap();
  readonly subjectsOf: TermMap<RDF.Term, TermSet> = new TermMap();
  readonly objectsOf: TermMap<RDF.Term, TermSet> = new TermMap();

  addAxiom(node: RDF.Term, shape: RDF.Term) {
    getWithDefaultInTermMultiMap(this.axiomTypes, node).add(shape);
  }
  
  addSubjectsOf(node: RDF.Term, shape: RDF.Term) {
    getWithDefaultInTermMultiMap(this.subjectsOf, node).add(shape);
  }

  addObjectsOf(node: RDF.Term, shape: RDF.Term) {
    getWithDefaultInTermMultiMap(this.objectsOf, node).add(shape);
  }

  getInitialState(position: NodePosition): TermSet {
    let set = new TermSet();

    if (position.node) {
      addAllFrom(set, this.axiomTypes.get(position.node));
    }

    addAllFrom(set, position.types);
    
    position.subjectOf.forEach(iri => addAllFrom(set, this.subjectsOf.get(iri)));

    return set;
  }
}

function addAllFrom(destination: TermSet, set: TermSet | undefined) {
  if (set === undefined) return;
  set.forEach(term => destination.add(term));
}

