import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import * as RDF from '@rdfjs/types';
import axios from 'axios';
import * as n3 from 'n3';
import { stringToTerm, termToString } from 'rdf-string';
import { $defaultGraph, ns } from '../PRECNamespace';

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
  _typeToPaths = new TermMap<RDF.Term, RDF.Term[]>();

  constructor(triples: RDF.Quad[]) {
    const store = new n3.Store(triples);

    for (const targetQuad of store.getQuads(null, ns.sh.targetClass, null, $defaultGraph)) {
      const ruleName = targetQuad.subject;
      const targetClass = targetQuad.object;

      const relevantShapes = [
        ruleName,
        // TODO: sh:node exploration should be recursive
        ...store.getQuads(ruleName, ns.sh.node, null, $defaultGraph)
        .map(q => q.object)
      ];

      const possiblePaths = computePossiblePathsFrom(store, relevantShapes);
      this._typeToPaths.set(targetClass, possiblePaths);
    }
  }

  /**
   * Return every type for which we have some information about the predicate it
   * uses
   */
  getAllTypes() {
    return [...this._typeToPaths.keys()];
  }

  /**
   * Return the list of all known possible predicates for a type
   * @param type The type
   * @returns All possible predicates
   */
  getAllRelevantPathsOfType(type: RDF.Term): RDF.Term[] {
    return this._typeToPaths.get(type) || [];
  }
}

function computePossiblePathsFrom(store: n3.Store, shapes: RDF.Term[]): RDF.Term[] {
  let result = new TermSet();

  for (const shape of shapes) {
    for (const { object: property } of store.getQuads(shape, ns.sh.property, null, $defaultGraph)) {
      const pathValues = store.getQuads(property, ns.sh.path, null, $defaultGraph);
      const maxCounts = store.getQuads(property, ns.sh.maxCount, null, $defaultGraph);

      if (undefined !== maxCounts.find(q => q.object.equals(n3.DataFactory.literal(0)))) {
        continue;
      }

      for (const pathValueQuad of pathValues) {
        result.add(pathValueQuad.object);
//        ok
//        console.log(`Shape ${termToString(shape)} uses the predicate ${termToString(pathValueQuad.object)}`);
      }
    }
  }

  return [...result.keys()];
}


