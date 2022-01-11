import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import * as RDF from '@rdfjs/types';
import axios from 'axios';
import * as n3 from 'n3';
import { stringToTerm, termToString } from 'rdf-string';
import { $defaultGraph, $quad, ns } from '../PRECNamespace';

// Term suggestion database that resorts to a SHACL shape graph.

// A SHACL shape graph is supposed to be used to validate an RDF graph. The
// specification also gives building forms as an example.
//
// Here, we use the shape graph to power up an autocompletion engine ?


/** The PREC validation shape graph */
export const PREC_SHAPE_GRAPH_LINK = "https://raw.githubusercontent.com/BruJu/PREC/ContextShape/data/PRECContextShape.ttl";

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

  /** Mapping of a type to its corresponding terms */
  readonly _shapes = new TermMap<RDF.Term, Shape>();

  readonly _cache: ShapeTargetToShape;

  constructor(triples: RDF.Quad[]) {
    const store = new n3.Store(triples);

    const r = extractListOfNodeShapes(store);
    this._shapes = r.shapeNameToShape;
    this._cache = r.cache;

    let resolvedShapes = new TermSet();

    for (const [ruleName, shape] of this._shapes) {
      if (!resolvedShapes.has(ruleName)) {
        resolveShape(store, ruleName, shape, this._shapes, resolvedShapes);
      }
    }
  }

  /**
   * Return every type for which we have some information about the predicate it
   * uses
   */
  getAllTypes() {
    return [...this._cache.class.keys()];
  }

  /**
   * Return the list of all known possible predicates for a type
   * @param type The type
   * @returns All possible predicates
   */
  getAllRelevantPathsOfType(
    node: RDF.Term | undefined, types: RDF.Term[], subjectOf: RDF.Term[]
  ): TermSet {
    let paths = new TermSet();

    function addPathIn(shapes: Shape[] | undefined) {
      if (shapes === undefined) return;

      for (const shape of shapes) {
        shape.directPaths.forEach(path => paths.add(path));
      }
    }

    if (node !== undefined) addPathIn(this._cache.node.get(node));

    types.forEach(type => addPathIn(this._cache.class.get(type)));
    subjectOf.forEach(subjectOf => addPathIn(this._cache.subjectsOf.get(subjectOf)));
  
    return paths;
  }
}

/** A shape */
class Shape {
  /** Name of the rule */
  readonly ruleName: RDF.Term;
  /** List of targets */
  readonly target: ShapeTargets;
  /** List of predice paths */
  readonly directPaths: RDF.Term[] = [];

  constructor(ruleName: RDF.Term) {
    this.ruleName = ruleName;
    this.target = {
      node: new TermSet(),
      class: new TermSet(),
      subjectsOf: new TermSet(),
//      objectsOf: new TermSet()
    };
  }
};

type ShapeTargets = {
  node: TermSet,
  class: TermSet,
  subjectsOf: TermSet,
//  objectsOf: TermSet // Not yet implemented
};

type ShapeTargetToShape = {
  node: TermMap<RDF.Term, Shape[]>,
  class: TermMap<RDF.Term, Shape[]>,
  subjectsOf: TermMap<RDF.Term, Shape[]>
};

function extractListOfNodeShapes(shapeGraph: RDF.DatasetCore)
: { shapeNameToShape: TermMap<RDF.Term, Shape>, cache: ShapeTargetToShape } {
  let result = new TermMap<RDF.Term, Shape>();
  let cache: ShapeTargetToShape = {
    node: new TermMap(),
    class: new TermMap(),
    subjectsOf: new TermMap()
  };

  const addOrGetShape = (shapeName: RDF.Term) => {
    let r = result.get(shapeName);
    if (r === undefined) {
      r = new Shape(shapeName);
      result.set(shapeName, r);
    }
    return r;
  };

  const addInCache = (type: keyof ShapeTargetToShape, target: RDF.Term, shape: Shape) => {
    let col = cache[type].get(target);
    if (col === undefined) {
      col = [];
      cache[type].set(target, col);
    }

    if (!col.includes(shape)) col.push(shape);

    return col;
  };

  // https://www.w3.org/TR/shacl/#shapes

  // - s is a SHACL instance of sh:NodeShape or sh:PropertyShape. 
  for (const quad of shapeGraph.match(null, ns.rdf.type, ns.sh.NodeShape, $defaultGraph)) {
    const shape = addOrGetShape(quad.subject);

    if (shapeGraph.has($quad(quad.subject, ns.rdf.type, ns.rdfs.Class, $defaultGraph))) {
      shape.target.class.add(quad.subject);
      addInCache('class', quad.subject, shape);
    }
  }

  // -  s is subject of a triple that has sh:targetClass, sh:targetNode,
  // sh:targetObjectsOf or sh:targetSubjectsOf as predicate. 
  const targetPredicates: { predicate: RDF.Term, target: keyof(ShapeTargets) }[] = [
    { predicate: ns.sh.targetClass, target: 'class' },
    { predicate: ns.sh.targetNode, target: 'node' },
    { predicate: ns.sh.targetObjectsOf, target: 'subjectsOf' },
//    { predicate: ns.sh.targetSubjectsOf, target: 'objectsOf' }
  ];

  for (const { predicate, target } of targetPredicates) {
    for (const quad of shapeGraph.match(null, predicate, null, $defaultGraph)) {
      const shape = addOrGetShape(quad.subject);
      shape.target[target].add(quad.object);

      addInCache(target, quad.object, shape);
    }
  }

  // - s is a value of a shape-expecting, non-list-taking parameter such as
  // sh:node, or a member of a SHACL list that is a value of a shape-expecting
  // and list-taking parameter such as sh:or. 
  for (const quad of shapeGraph.match(null, ns.sh.node, null, $defaultGraph)) {
    addOrGetShape(quad.subject);
  }

  return { shapeNameToShape: result, cache: cache };
}



function resolveShape(
  store: RDF.DatasetCore,
  ruleName: RDF.Term, shape: Shape,
  allShapes: TermMap<RDF.Term, Shape>, resolved: TermSet
) {
  resolved.add(ruleName);

  let possiblePaths = new TermSet();

  for (const { object: property } of store.match(ruleName, ns.sh.property, null, $defaultGraph)) {
    const pathValues = store.match(property, ns.sh.path, null, $defaultGraph);
    const maxCounts = store.match(property, ns.sh.maxCount, null, $defaultGraph);

    if (maxCounts.has($quad(property as RDF.Quad_Subject, ns.sh.maxCount, n3.DataFactory.literal(0), $defaultGraph))) {
      continue;
    }

    for (const pathValueQuad of pathValues) {
      possiblePaths.add(pathValueQuad.object);
//        console.log(`Shape ${termToString(shape)} uses the predicate ${termToString(pathValueQuad.object)}`);
    }

  }


  for (const childShapeQuad of store.match(ruleName, ns.sh.node, null, $defaultGraph)) {
    const childShapeName = childShapeQuad.object;
    const childShape = allShapes.get(childShapeName);
    if (childShape === undefined) {
      throw Error(
        "resolveShape(): " +
        `${termToString(childShapeName)} is a subshape of ${termToString(ruleName)}`
        + " but its shape object has not been found"
      );
    }

    if (!resolved.has(childShapeName)) {
      resolveShape(store, childShapeName, childShape, allShapes, resolved);
    }

    childShape.directPaths.forEach(path => possiblePaths.add(path));
  }

  shape.directPaths.push(...possiblePaths);
}
