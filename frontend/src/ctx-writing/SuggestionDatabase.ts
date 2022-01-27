import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import * as RDF from '@rdfjs/types';
import axios from 'axios';
import * as n3 from 'n3';
import Description from './ontology/Description';
import RDFAutomata from './ontology/RDFAutomata';
import AutomataStateInitializer from './ontology/AutomataStateInitializer';
import OntologyBuilder from './ontology/OntologyBuilder';

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

    const builder = new OntologyBuilder();
    builder.addRDFS(store);
    builder.addSHACL(store);

    const r = builder.build(store);
    this.automata = r.automata;
    this.initialTypes = r.types;
    this.initializer = r.initializer;
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
    this.automata.trimState(state);
    return this.automata.getPossiblePaths(state);
  }
}

