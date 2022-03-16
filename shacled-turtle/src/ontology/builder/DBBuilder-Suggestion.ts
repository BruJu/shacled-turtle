import TermMap from "@rdfjs/term-map";
import * as RDF from "@rdfjs/types";
import { getWithDefault } from "../../util";
import Description from "../Description";
import SuggestionDatabase, { Suggestions } from "../SubDB-Suggestion";

/**
 * Builder for the suggestion database
 */
export default class SuggestionDBBuilder {
  readonly subjectTypingPredicates = new Suggestions();
  readonly existingTypes = new Suggestions();
  readonly followingTypePaths = new TermMap<RDF.NamedNode, Suggestions>();
  readonly followingShapePaths = new TermMap<RDF.Term, Suggestions>();

  addTypingPredicate(predicate: RDF.Term, description: Description) {
    this.subjectTypingPredicates.add(predicate, description);
  }

  addExistingType(type: RDF.Term, description: Description) {
    this.existingTypes.add(type, description);
  }

  addTypePath(from: RDF.Term, predicate: RDF.NamedNode, description: Description) {
    getWithDefault(this.followingTypePaths, from, () => new Suggestions())
    .add(predicate, description);
  }

  addShapePath(from: RDF.Term, predicate: RDF.NamedNode, description: Description) {
    getWithDefault(this.followingShapePaths, from, () => new Suggestions())
    .add(predicate, description);
  }

  build(): SuggestionDatabase {
    return new SuggestionDatabase(this);
  }
}
