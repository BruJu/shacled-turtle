import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import * as RDF from '@rdfjs/types';
import axios from 'axios';
import * as n3 from 'n3';
import Description from '../ontology/Description';
import MetaDataState from '../ontology/MetaDataState';
import Ontology from '../ontology/OntologyBuilder';
import { Suggestion } from '../ontology/Suggestible';

// Term suggestion database that resorts to a SHACL shape graph.

// A SHACL shape graph is supposed to be used to validate an RDF graph. The
// specification also gives building forms as an example.
//
// Here, we use the shape graph to power up an autocompletion engine ?

const $variable = n3.DataFactory.variable;

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
  term: RDF.Term,
  description: Description
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

  readonly ontology: Ontology;

  constructor(triples: RDF.Quad[]) {
    const store: RDF.DatasetCore = new n3.Store(triples);
    this.ontology = Ontology.make(store);

    console.log(this.ontology.suggestible);
  }

  /**
   * Return every type for which we have some information about the predicate it
   * uses
   */
  getAllTypes(): Suggestion[] {
    return this.ontology.suggestible.getTypes();
  }

  /**
   * Return the list of all known possible predicates for a type
   * @param type The type
   * @returns All possible predicates
   */
  getAllRelevantPathsOfType(
    currentSubject: RDF.Term,
    // currentPredicate: RDF.Term | undefined,
    allTriples: RDF.Quad[]
  ): Suggestion[] {
    const state = new MetaDataState(this.ontology);

    const store = new n3.Store(allTriples);
    allTriples.forEach(triple => {
      this.ontology.ruleset.onNewTriple(triple, store, state)
    });
    
    return this.ontology.suggestible.getAllPathsFor(
      state.types.getAll(currentSubject),
      state.shapes.getAll(currentSubject)
    );
  }
}

