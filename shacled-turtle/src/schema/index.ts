import * as RDF from "@rdfjs/types";
import SchemaBuilder from "./builder";
import InferenceEngine from "./InferenceEngine";
import SuggestionEngine, { Suggestion } from './SuggestionEngine';

// Term suggestion database that resorts to a SHACL shape graph.

// A SHACL shape graph is supposed to be used to validate an RDF graph. The
// specification also gives building forms as an example.
//
// Here, we use the shape graph to power up an autocompletion engine

/**
 * A loaded schema used for autocompletion = the two engines used by
 * Shacled Turtle with the rules loaded
 */
export default class Schema {
  readonly inferenceEngine: InferenceEngine;
  readonly suggestionEngine: SuggestionEngine;

  constructor(inferenceEngine: InferenceEngine, suggestionEngine: SuggestionEngine) {
    this.inferenceEngine = inferenceEngine;
    this.suggestionEngine = suggestionEngine;
  }

  /**
   * Build a Shacled Turtle Schema instance from an RDF/JS dataset with the
   * schema triples.
   * @param schemaDataset The triples of the schema
   * @returns The Shacled Turtle schema instance.
   */
  static make(schemaDataset: RDF.DatasetCore): Schema {
    const builder = new SchemaBuilder();
    builder.addRDFS(schemaDataset);
    builder.addSHACL(schemaDataset);
    builder.addMisc(schemaDataset);
    return builder.build();
  }

  /**
   * Return every type for which we have some information about the predicate it
   * uses = types for which we will be able to suggest some predicates for their
   * instances.
   */
  getAllTypes(): Suggestion[] {
    return this.suggestionEngine.getTypes();
  }
}
