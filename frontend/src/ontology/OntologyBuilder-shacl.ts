import * as RDF from '@rdfjs/types'
import { OntologyBuilder } from './OntologyBuilder';
import { ns, $quad, $defaultGraph } from '../PRECNamespace';
import * as n3 from 'n3';
import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import Description from './Description';
import addPath from './PathDecomposer';

export default function addSHACL(builder: OntologyBuilder, store: RDF.DatasetCore) {
  let generator = { nextBlankNode: 0 };

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
    
    resolveShape(builder, store, shapeName, generator);
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
  shapeName: RDF.Term, generator: { nextBlankNode: number }
) {
  for (const { object: property } of store.match(shapeName, ns.sh.property, null, $defaultGraph)) {
    const pathValues = store.match(property, ns.sh.path, null, $defaultGraph);
    const maxCounts = store.match(property, ns.sh.maxCount, null, $defaultGraph);

    if (maxCounts.has($quad(property as RDF.Quad_Subject, ns.sh.maxCount, n3.DataFactory.literal(0), $defaultGraph))) {
      continue;
    }

    const pathDescription = new Description().addAllComments(store, property as RDF.Quad_Subject);

    const endTypes = store.match(property, ns.sh.node, null, $defaultGraph);
    const endType = endTypes.size === 0 ? null : [...endTypes][0].object;

    for (const pathValueQuad of pathValues) {
      addPath(
        pathValueQuad.object, store,
        {
          startType: shapeName,
          endType: endType,

          generateBlankType() {
            return n3.DataFactory.blankNode("shacledturtle-bn-" + (++generator.nextBlankNode));
          },

          addPath(subjectType: RDF.Term, predicate: RDF.Term, objectType: RDF.Term, knowing: "subject" | "object") {
            console.log(subjectType, predicate, objectType, knowing);
            if (knowing === "subject") {
              ontoBuilder.rulesBuilder.shPredicatePath(subjectType, predicate, objectType);
              ontoBuilder.suggestibleBuilder.addShapePath(subjectType, predicate as RDF.NamedNode, pathDescription);
            } else {
              ontoBuilder.rulesBuilder.shInversePredicatePath(subjectType, predicate, objectType);
            }
          },

          addSubshape(subshape: RDF.Term, supershape: RDF.Term) {
            ontoBuilder.rulesBuilder.shSubShape(subshape, supershape);
          }
        }
      );
    }
  }
}
