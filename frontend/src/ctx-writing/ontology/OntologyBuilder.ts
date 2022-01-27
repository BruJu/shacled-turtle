import * as RDF from "@rdfjs/types";
import TermSet from "@rdfjs/term-set";
import * as n3 from 'n3';
import AutomataStateInitializer from "./AutomataStateInitializer";
import Description from "./Description";
import RDFAutomata, { RDFAutomataBuilder } from "./RDFAutomata";
import TermMap from "@rdfjs/term-map";

import addRDFS from './OntologyBuilder-rdfs';
import addSHACL from './OntologyBuilder-shacl';

const $variable = n3.DataFactory.variable;
const $all = $variable("-all"); // TODO: replace $all with $unknown


export default class OntologyBuilder {
  readonly initializer: AutomataStateInitializer;
  readonly builder: RDFAutomataBuilder<Description>;

  constructor() {
    this.initializer = new AutomataStateInitializer();
    this.builder = new RDFAutomataBuilder(
      () => new Description()
    );
  }

  addRDFS(store: RDF.DatasetCore) { addRDFS(this, store); }
  addSHACL(store: RDF.DatasetCore) { addSHACL(this, store); }

  rdfsDomain(iri: RDF.Term, type: RDF.Term) {
    this.initializer.addSubjectsOf(iri, type);
    this.builder.addTransition(type, $all, iri);
  }

  rdfsRange(iri: RDF.Term, type: RDF.Term) {
    this.initializer.addObjectsOf(iri, type);
    this.builder.addTransition($all, type, iri);
  }

  subClassOf(subClass: RDF.Term, superClass: RDF.Term) {
    this.builder.addTransition(subClass, superClass, null);
  }

  type(type: RDF.Term) {
    return this.builder.addState(type);
  }

  axiomTypes(nodes: TermSet<RDF.Term>, type: RDF.Term) {
    nodes.forEach(node => this.initializer.addAxiom(node, type));
  }

  path(shapeType: RDF.Term, property: RDF.Term) {
    return this.builder.addTransition(shapeType, $all, property);
  }

  private resolveDescriptionOfNodes(store: RDF.DatasetCore<RDF.Quad, RDF.Quad>) {
    for (const [type, meta] of this.builder.states) {
      if (!meta.isSuggestible) continue;
      meta.metaData.addLabelsAndComments(store, type as RDF.Quad_Subject);
    }
  }

  build(store: RDF.DatasetCore<RDF.Quad, RDF.Quad>): {
    automata: RDFAutomata<Description>,
    types: TermMap<RDF.Term, Description>,
    initializer: AutomataStateInitializer
  } {
    this.resolveDescriptionOfNodes(store);
    const r = this.builder.build((acc, other) => acc.addAll(other));

    return {
      automata: r.automata,
      types: r.types,
      initializer: this.initializer
    };
  }
}
