import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import { getWithDefault } from "../util";
import SuggestionDBBuilder from "./builder/DBBuilder-Suggestion";
import Description from "./Description";

/** An RDF term suggestion */
export type Suggestion = {
  /** The suggested term */
  term: RDF.Term;
  /** The list of its labels and comments to display */
  description: Description;
};

/** A mapping of suggestible terms to their description */
export class Suggestions {
  private readonly map: TermMap<RDF.Term, Description> = new TermMap();

  add(term: RDF.Term, description: Description) {
    getWithDefault(this.map, term, () => new Description())
    .addAll(description);
  }

  static get(...suggestions: Suggestions[]): Suggestion[] {
    let res = new TermMap<RDF.Term, Description>();
    
    for (const suggestion of suggestions) {
      for (const [key, value] of suggestion.map) {
        getWithDefault(res, key, () => new Description())
        .addAll(value);
      }
    }

    return [...res.entries()]
      .map(([key, value]) => ({ term: key, description: value }));
  }
}

export default class SuggestionDatabase {
  private readonly existingTypes: Suggestion[];
  private readonly subjectTypingPredicates: Suggestion[];
  private readonly followingTypePaths: TermMap<RDF.NamedNode, Suggestions>;
  private readonly followingShapePaths: TermMap<RDF.Term, Suggestions>;

  constructor(builder: SuggestionDBBuilder) {
    this.existingTypes = Suggestions.get(builder.existingTypes);
    this.subjectTypingPredicates = Suggestions.get(builder.subjectTypingPredicates);
    this.followingTypePaths = builder.followingTypePaths;
    this.followingShapePaths = builder.followingShapePaths;
  }

  /** Return all known types in the database */
  getTypes() { return this.existingTypes; }

  /** Return all predicates that helps typing resources */
  private getAllTypingPredicates() {
    return this.subjectTypingPredicates;
  }

  getAllPathsFor(types: TermSet, shapes: TermSet) {
    function mapKind(set: TermSet, following: TermMap<RDF.Term, Suggestions>) {
      let result: Suggestions[] = [];

      for (const term of set) {
        const x = following.get(term);
        if (x !== undefined) result.push(x);
      }

      return result;
    }

    if (types.size === 0 && shapes.size === 0) {
      return this.getAllTypingPredicates();
    }

    const mappedTypes = mapKind(types, this.followingTypePaths);
    const mappedShapes = mapKind(shapes, this.followingShapePaths);

    return Suggestions.get(...mappedTypes, ...mappedShapes);
  }
}
