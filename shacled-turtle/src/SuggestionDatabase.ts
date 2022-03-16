import * as RDF from '@rdfjs/types';
import * as n3 from 'n3';
import MetaDataState from './ontology/MetaDataState';
import Ontology from './ontology/OntologyBuilder';
import { Suggestion } from './ontology/Suggestible';

// Term suggestion database that resorts to a SHACL shape graph.

// A SHACL shape graph is supposed to be used to validate an RDF graph. The
// specification also gives building forms as an example.
//
// Here, we use the shape graph to power up an autocompletion engine ?


/**
 * A database used to suggest some terms for auto completion, backed by a SHACL
 * graph.
 */
export default class SuggestionDatabase {
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

