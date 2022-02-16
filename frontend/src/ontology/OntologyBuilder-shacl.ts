import * as RDF from '@rdfjs/types'
import { OntologyBuilder } from './OntologyBuilder';
import { ns, $quad, $defaultGraph } from '../PRECNamespace';
import * as n3 from 'n3';
import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import Description from './Description';

export default function addSHACL(builder: OntologyBuilder, store: RDF.DatasetCore) {
  const shapeNameToShape = extractListOfNodeShapes(store);

  for (const [shapeName, shape] of shapeNameToShape) {
    for (const superShape of shape.superShape) {
      builder.rulesBuilder.shSubShape(shapeName, superShape)
    }

    for (const cl of shape.target.class) {
      builder.rulesBuilder.shTargetClass(shapeName, cl);

      builder.suggestibleBuilder.addExistingType(
        cl, OntologyBuilder.descriptionOf(store, cl)
      );
    }

    for (const predicate of shape.target.subjectsOf) {
      builder.rulesBuilder.shSubjectsOf(shapeName, predicate);

      builder.suggestibleBuilder.addTypingPredicate(
        predicate, OntologyBuilder.descriptionOf(store, predicate)
      );
    }

    for (const predicate of shape.target.objectsOf) {
      builder.rulesBuilder.shObjectsOf(shapeName, predicate);
    }

    shape.target.node.forEach(node =>
      builder.rulesBuilder.shTargetNode(node, shapeName)  
    );
    
    resolveShape(builder, store, shapeName, shape);
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



function resolveShape(
  ontoBuilder: OntologyBuilder,
  store: RDF.DatasetCore,
  shapeName: RDF.Term, shape: ShapeInGraph,
) {


  for (const { object: property } of store.match(shapeName, ns.sh.property, null, $defaultGraph)) {
    const pathValues = store.match(property, ns.sh.path, null, $defaultGraph);
    const maxCounts = store.match(property, ns.sh.maxCount, null, $defaultGraph);

    if (maxCounts.has($quad(property as RDF.Quad_Subject, ns.sh.maxCount, n3.DataFactory.literal(0), $defaultGraph))) {
      continue;
    }

    for (const pathValueQuad of pathValues) {
      const object = pathValueQuad.object;
      if (object.termType !== 'NamedNode') continue;

      const pathDescription = buildPathDescription(store, property);
      ontoBuilder.suggestibleBuilder.addShapePath(shapeName, object,
        pathDescription
      );

      for (const { object: node } of store.match(property, ns.sh.node, null, $defaultGraph)) {
        ontoBuilder.rulesBuilder.shPredicatePath(shapeName, object, node);
      }
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
