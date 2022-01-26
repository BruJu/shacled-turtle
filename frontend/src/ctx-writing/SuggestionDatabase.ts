import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import * as RDF from '@rdfjs/types';
import axios from 'axios';
import * as n3 from 'n3';
import { termToString } from 'rdf-string';
import { $defaultGraph, $quad, ns } from '../PRECNamespace';
import Description from './ontology/Description';
import RDFAutomata, { RDFAutomataBuilder } from './ontology/RDFAutomata';
import AutomataStateInitializer from './ontology/AutomataStateInitializer';

// Term suggestion database that resorts to a SHACL shape graph.

// A SHACL shape graph is supposed to be used to validate an RDF graph. The
// specification also gives building forms as an example.
//
// Here, we use the shape graph to power up an autocompletion engine ?


const $variable = n3.DataFactory.variable;
const $any = $variable("-any");
const $all = $variable("-all"); // TODO: replace $all with $unknown

/** The PREC validation shape graph */
export const PREC_SHAPE_GRAPH_LINK = "https://raw.githubusercontent.com/BruJu/PREC/ContextShape/data/PRECContextShape.ttl";

export type PathInfo = {
  why: ShapeOrigin,
  description: PathDescription;
};

export type PathDescription = {
  labels?: RDF.Literal[];
  descriptions?: RDF.Literal[];
};

export type SuggestableType = {
  class: RDF.Term,
  info: PathDescription
};

/** A shape */
class ShapeInGraph {
  /** Name of the shape */
  readonly ruleName: RDF.Term;
  /** List of targets */
  readonly target: ShapeTargets = {
    node: new TermSet(),
    class: new TermSet(),
    subjectsOf: new TermSet(),
    objectsOf: new TermSet()
  };

  readonly superShape = new TermSet();

  readonly description: Description = new Description();

  constructor(ruleName: RDF.Term) {
    this.ruleName = ruleName;
  }
};

export type ShapeOrigin =
  { type: 'node' }
  | { type: 'type', value: RDF.Term }
  | { type: 'subjectOf', value: RDF.Term };

/**
 * A database used to suggest some terms for auto completion, backed by a SHACL
 * graph.
 */
export default class SuggestionDatabase {
  /**
   * Build a SuggestionDatabase for the ontology described by the shape graph
   * located at the given URL
   * @param shapeGraphUrl The URL of the shape graph
   * @returns At some point, a SuggestionDatabase
   */
  static async load(shapeGraphUrl: string = PREC_SHAPE_GRAPH_LINK): Promise<SuggestionDatabase> {
    const answer = await axios.get<string>(shapeGraphUrl);
    if (answer.status !== 200) throw Error("SuggestionDatabase::load: Error " + answer.status);

    return new SuggestionDatabase(new n3.Parser().parse(answer.data));
  }

  readonly automata: RDFAutomata<Description>;
  readonly initialTypes: TermMap<RDF.Term, Description>;
  readonly initializer: AutomataStateInitializer; 

  constructor(triples: RDF.Quad[]) {
    const store: RDF.DatasetCore = new n3.Store(triples);

    const automataBuilder = new RDFAutomataBuilder<Description>(
      () => new Description()
    );

    const initializer = new AutomataStateInitializer();
    const ontologyBuilder = new OntologyBuilder(initializer, automataBuilder);
    
    addRDFS(ontologyBuilder, store);
    addSHACL(ontologyBuilder, store);
    ontologyBuilder.resolveDescriptionOfNodes(store);

    const r = automataBuilder.build((acc, other) => acc.addAll(other));
    this.automata = r.automata;
    this.initialTypes = r.types;
    this.initializer = initializer;
  }

  /**
   * Return every type for which we have some information about the predicate it
   * uses
   */
  getAllTypes(): SuggestableType[] {
    return [...this.initialTypes]
    .map(([type, description]) => ({
      class: type,
      info: {
        labels: [...description.labels],
        descriptions: [...description.comments]
      }
    }));
  }

  /**
   * Return the list of all known possible predicates for a type
   * @param type The type
   * @returns All possible predicates
   */
  getAllRelevantPathsOfType(
    node: RDF.Term | undefined,
    types: TermSet,
    subjectOf: TermSet
  ): TermMap<RDF.Term, Description> {
    const state = this.initializer.getInitialState({ node, types, subjectOf });
    
    state.add($all);
    console.log([...state].map(t => termToString(t)).join(" ; "));
    this.automata.trimState(state);
    console.log([...state].map(t => termToString(t)).join(" ; "));
    return this.automata.getPossiblePaths(state);
  }
}



type ShapeTargets = {
  node: TermSet,
  class: TermSet,
  subjectsOf: TermSet,
  objectsOf: TermSet
};

function extractListOfNodeShapes(shapeGraph: RDF.DatasetCore)
: TermMap<RDF.Term, ShapeInGraph> {
  let result = new TermMap<RDF.Term, ShapeInGraph>();

  const addOrGetShape = (shapeName: RDF.Term) => {
    let r = result.get(shapeName);
    if (r === undefined) {
      r = new ShapeInGraph(shapeName);
      result.set(shapeName, r);
    }
    return r;
  };

  // https://www.w3.org/TR/shacl/#shapes

  // - s is a SHACL instance of sh:NodeShape or sh:PropertyShape. 
  for (const quad of shapeGraph.match(null, ns.rdf.type, ns.sh.NodeShape, $defaultGraph)) {
    const shape = addOrGetShape(quad.subject);

    if (shapeGraph.has($quad(quad.subject, ns.rdf.type, ns.rdfs.Class, $defaultGraph))) {
      shape.target.class.add(quad.subject);

      shape.description
      .addLabelsAndComments(shapeGraph, quad.subject);
    }
  }

  // -  s is subject of a triple that has sh:targetClass, sh:targetNode,
  // sh:targetObjectsOf or sh:targetSubjectsOf as predicate. 
  const targetPredicates: { predicate: RDF.Term, target: keyof(ShapeTargets) }[] = [
    { predicate: ns.sh.targetClass, target: 'class' },
    { predicate: ns.sh.targetNode, target: 'node' },
    { predicate: ns.sh.targetSubjectsOf, target: 'subjectsOf' },
    { predicate: ns.sh.targetObjectsOf, target: 'objectsOf' }
  ];

  for (const { predicate, target } of targetPredicates) {
    for (const quad of shapeGraph.match(null, predicate, null, $defaultGraph)) {
      const shape = addOrGetShape(quad.subject);
      shape.target[target].add(quad.object);

      shape.description
      .addLabelsAndComments(shapeGraph, quad.subject);
    }
  }

  // - s is a value of a shape-expecting, non-list-taking parameter such as
  // sh:node, or a member of a SHACL list that is a value of a shape-expecting
  // and list-taking parameter such as sh:or. 
  for (const quad of shapeGraph.match(null, ns.sh.node, null, $defaultGraph)) {
    addOrGetShape(quad.subject).superShape.add(quad.object);
  }

  return result;
}

function buildPathDescription(store: RDF.DatasetCore, focus: RDF.Term): Description {
  // TODO: integrate these predicates in Description
  const labels = getLiterals(
    store.match(focus, ns.rdfs.label, null, $defaultGraph),
    store.match(focus, n3.DataFactory.namedNode(ns.sh[''].value + 'name'), null, $defaultGraph)
  );
  const comments = getLiterals(
    store.match(focus, ns.rdfs.comment, null, $defaultGraph),
    store.match(focus, ns.sh.comment, null, $defaultGraph)
  );

  const d = new Description();

  for (const label of labels) d.labels.add(label);
  for (const comment of comments) d.comments.add(comment);

  return d;
}

function getLiterals(...quadss: Iterable<RDF.Quad>[]): TermSet<RDF.Literal> {
  return new TermSet(
    [...quadss]
    .flatMap(quads => [...quads].map(quad => quad.object))
    .filter(isLiteral)
  );
}

function isLiteral(term: RDF.Term): term is RDF.Literal {
  return term.termType === 'Literal';
}

function merge(destination: PathDescription, source: PathDescription) {
  if (source.labels && source.labels.length > 0) {
    destination.labels = destination.labels || [];
    destination.labels.push(...source.labels);
  }

  if (source.descriptions && source.descriptions.length > 0) {
    destination.descriptions = destination.descriptions || [];
    destination.descriptions.push(...source.descriptions);
  }
}

export function mergeAll(paths: PathDescription[]): PathDescription {
  let dest: PathDescription = {};

  for (const path of paths) {
    merge(dest, path);
  }

  return dest;
}

class OntologyBuilder {
  readonly initializer: AutomataStateInitializer;
  readonly builder: RDFAutomataBuilder<Description>;

  constructor(
    initializer: AutomataStateInitializer,
    builder: RDFAutomataBuilder<Description>
  ) {
    this.initializer = initializer;
    this.builder = builder;
  }

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

  resolveDescriptionOfNodes(store: RDF.DatasetCore<RDF.Quad, RDF.Quad>) {
    for (const [type, meta] of this.builder.states) {
      if (!meta.isSuggestible) continue;
      meta.metaData.addLabelsAndComments(store, type as RDF.Quad_Subject);
    }
  }
};


function addRDFS(ontoBuilder: OntologyBuilder, store: RDF.DatasetCore) {
  for (const quad of store.match(null, ns.rdfs.domain, null)) {
    // TODO: consider subPropertyOf*/domain
    ontoBuilder.rdfsDomain(quad.subject, quad.object);
    ontoBuilder.type(quad.object).isSuggestible = true;
  }

  for (const quad of store.match(null, ns.rdfs.range, null)) {
    // TODO: consider subPropertyOf*/range
    ontoBuilder.rdfsRange(quad.subject, quad.object);
    ontoBuilder.type(quad.object).isSuggestible = true;
  }

  for (const quad of store.match(null, ns.rdfs.subClassOf, null)) {
    ontoBuilder.subClassOf(quad.subject, quad.object);
  }

  for (const quad of store.match(null, ns.rdf.type, ns.rdfs.Class)) {
    ontoBuilder.type(quad.subject).isSuggestible = true;
  }
}

class ShapeToFakeType {
  private readonly map: TermMap<RDF.Term, RDF.Variable> = new TermMap();
  private next = 1;

  get(shape: RDF.Term): RDF.Variable {
    let type = this.map.get(shape);
    if (type !== undefined) return type;
    type = n3.DataFactory.variable("Shape#" + this.next + "~" + shape.value);
    ++this.next;
    this.map.set(shape, type);
    return type;
  }
}

function addSHACL(ontoBuilder: OntologyBuilder, store: RDF.DatasetCore) {
  const dict = new ShapeToFakeType();

  const shapeNameToShape = extractListOfNodeShapes(store);

  for (const [ruleName, shape] of shapeNameToShape) {
    const thisType = dict.get(ruleName);

    ontoBuilder.type(thisType);

    for (const superShape of shape.superShape) {
      ontoBuilder.subClassOf(thisType, dict.get(superShape));
    }

    for (const cl of shape.target.class) {
      ontoBuilder.subClassOf(cl, thisType);
      ontoBuilder.type(cl).isSuggestible = true;
    }

    for (const predicate of shape.target.subjectsOf) {
      ontoBuilder.rdfsDomain(predicate, thisType);
    }

    for (const predicate of shape.target.objectsOf) {
      ontoBuilder.rdfsRange(predicate, thisType);
    }

    ontoBuilder.axiomTypes(shape.target.node, thisType);

    resolveShape(ontoBuilder, store, ruleName, shape, dict);
  }
}



function resolveShape(
  ontoBuilder: OntologyBuilder,
  store: RDF.DatasetCore,
  ruleName: RDF.Term, shape: ShapeInGraph,
  shapesToType: ShapeToFakeType
) {
  const shapeType = shapesToType.get(ruleName);

  for (const { object: property } of store.match(ruleName, ns.sh.property, null, $defaultGraph)) {
    const pathValues = store.match(property, ns.sh.path, null, $defaultGraph);
    const maxCounts = store.match(property, ns.sh.maxCount, null, $defaultGraph);

    if (maxCounts.has($quad(property as RDF.Quad_Subject, ns.sh.maxCount, n3.DataFactory.literal(0), $defaultGraph))) {
      continue;
    }

    for (const pathValueQuad of pathValues) {
      const object = pathValueQuad.object;
      if (object.termType !== 'NamedNode') continue;

      const pathDescription = buildPathDescription(store, property);

      ontoBuilder.path(shapeType, object)
      .addAll(pathDescription);

//        console.log(`Shape ${termToString(shape)} uses the predicate ${termToString(pathValueQuad.object)}`);
    }
  }
}
