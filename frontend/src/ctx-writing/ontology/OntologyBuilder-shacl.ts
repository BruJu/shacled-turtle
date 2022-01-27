import * as RDF from '@rdfjs/types'
import OntologyBuilder from './OntologyBuilder';
import { ns, $quad, $defaultGraph } from '../../PRECNamespace';
import * as n3 from 'n3';
import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import Description from './Description';

export default function addSHACL(ontoBuilder: OntologyBuilder, store: RDF.DatasetCore) {
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
