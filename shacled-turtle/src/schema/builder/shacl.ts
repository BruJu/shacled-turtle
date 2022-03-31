import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import * as RDF from '@rdfjs/types';
import * as n3 from 'n3';
import { $defaultGraph, $quad, ns } from '../../namespaces';
import Description from '../Description';
import OntologyBuilder from './index';
import addPath, { PathWriter } from './PathDecomposer';

/**
 * Adds rules to the ontology related to SHACL
 * 
 * We consider that SHACL can be seen:
 * - As an inference system -> we infer that some elements must complies with
 * shapes thanks to sh:targetclass / sh:targetNode / sh:subjectsOf
 * / sh:objectsOf and by being the sh:node target of a path
 * - As a suggestion engine -> suggest completion related to possibles paths
 * and sh:subjectsOf
 */
export default function addSHACL(builder: OntologyBuilder, store: RDF.DatasetCore) {
  let generator = new BlankNodeGenerator();

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

      const description = OntologyBuilder.descriptionOf(store, predicate);

      builder.suggestibleBuilder.addTypingPredicate(
        predicate, description
      );

      builder.suggestibleBuilder.addShapePath(
        shapeName, predicate as RDF.NamedNode, new Description()
      );
    }

    for (const predicate of shape.target.objectsOf) {
      builder.rulesBuilder.shObjectsOf(shapeName, predicate);

      builder.suggestibleBuilder.addTypePathTarget(
        null, predicate as RDF.NamedNode, { shape: shapeName }
      )
    }

    shape.target.node.forEach(node =>
      builder.rulesBuilder.shTargetNode(shapeName, node)  
    );
    
    readPathsOfShape(builder, store, shapeName, generator);
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


/**
 * Read all property path bound to the given shape and 
 * @param ontoBuilder Builder for the ontology
 * @param store The RDF/JS dataset
 * @param shapeName The name of the node shape
 * @param generator A unique blank node generator
 */
function readPathsOfShape(
  ontoBuilder: OntologyBuilder,
  store: RDF.DatasetCore,
  shapeName: RDF.Term, generator: BlankNodeGenerator
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

    const usableNodes: PathWriter = {
      startType: shapeName, endType: endType,
      generateBlankType: () => generator.generate()
    };

    for (const pathValueQuad of pathValues) {
      const transitions = addPath(pathValueQuad.object, store, usableNodes);

      if (transitions !== false) {
        for (const transition of transitions.transitions) {
          if (transition.type === "epsilon") {
            ontoBuilder.rulesBuilder.shSubShape(transition.from, transition.to);
          } else {
            const { from, predicate, to } = transition;

            if (transition.type === "+") {
              ontoBuilder.rulesBuilder.shPredicatePath(from, predicate, to);
              ontoBuilder.suggestibleBuilder.addShapePath(from, predicate, pathDescription);

              if (endType !== null && transitions.ends.has(to)) {
                ontoBuilder.suggestibleBuilder.addTypePathTarget(
                  { shape: from }, predicate, { shape: endType }
                )
              }
            } else if (transition.type === "-") {
              ontoBuilder.rulesBuilder.shInversePredicatePath(to, predicate, from);
            }
          }
        }
      }
    }
  }
}


class BlankNodeGenerator {
  nextId: number = 0;

  generate() {
    return n3.DataFactory.blankNode("shacledturtle-bn-" + (++this.nextId));
  }
}
