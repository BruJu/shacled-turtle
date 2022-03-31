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
  private readonly map: TermMap<RDF.Term, FollowingSuggestion> = new TermMap();

  add(term: RDF.Term, description: Description) {
    getWithDefault(this.map, term, () => new FollowingSuggestion())
    .description.addAll(description);
  }

  addTarget(term: RDF.Term, object: TypesAndShapes) {
    getWithDefault(this.map, term, () => new FollowingSuggestion())
    .object.addAll(object);
  }

  static get(...suggestions: Suggestions[]): Suggestion[] {
    let res = new TermMap<RDF.Term, Description>();
    
    for (const suggestion of suggestions) {
      for (const [key, value] of suggestion.map) {
        getWithDefault(res, key, () => new Description())
        .addAll(value.description);
      }
    }

    return [...res.entries()]
      .map(([key, value]) => ({ term: key, description: value }));
  }
  
  getAfterPath(predicate: RDF.Term, addIfAbsent = false): TypesAndShapes | null {
    const following = this.map.get(predicate);
    if (following === undefined) {
      if (addIfAbsent) {
        const f = new FollowingSuggestion();
        this.map.set(predicate, f);
        return f.object;
      } else {
        return null;
      }
    }
    return following.object;
  }
}

export class FollowingSuggestion {
  description: Description = new Description();
  object: TypesAndShapes = new TypesAndShapes();
};

export default class SuggestionDatabase {
  private readonly existingTypes: Suggestion[];
  private readonly subjectTypingPredicates: Suggestion[];
  private readonly followingTypePaths: TermMap<RDF.NamedNode, Suggestions>;
  private readonly followingShapePaths: TermMap<RDF.Term, Suggestions>;
  private readonly endFromAny: TermMap<RDF.Term, TypesAndShapes>;

  constructor(builder: SuggestionDBBuilder) {
    this.existingTypes = Suggestions.get(builder.existingTypes);
    this.subjectTypingPredicates = Suggestions.get(builder.subjectTypingPredicates);
    this.followingTypePaths = builder.followingTypePaths;
    this.followingShapePaths = builder.followingShapePaths;
    this.endFromAny = builder.endFromAny;
  }

  /** Return all known types in the database */
  getTypes() { return this.existingTypes; }

  /** Return all predicates that helps typing resources */
  private getAllTypingPredicates() {
    return this.subjectTypingPredicates;
  }

  getAllPathsFor(subject: TypesAndShapes): Suggestion[] {
    function mapKind(set: TermSet, following: TermMap<RDF.Term, Suggestions>) {
      let result: Suggestions[] = [];

      for (const term of set) {
        const x = following.get(term);
        if (x !== undefined) result.push(x);
      }

      return result;
    }

    if (subject.isEmpty()) {
      return this.getAllTypingPredicates();
    }

    const mappedTypes = mapKind(subject.types, this.followingTypePaths);
    const mappedShapes = mapKind(subject.shapes, this.followingShapePaths);

    return Suggestions.get(...mappedTypes, ...mappedShapes);
  }

  getPossibleObjectShape(subject: TypesAndShapes, predicate: RDF.Term): TypesAndShapes {
    let result = new TypesAndShapes();

    function process(suggestions: Suggestions | undefined) {
      if (suggestions === undefined) return;

      const afterPath = suggestions.getAfterPath(predicate);
      if (afterPath === null) return;

      result.addAll(afterPath);
    }

    for (const type of subject.types) {
      process(this.followingTypePaths.get(type as RDF.NamedNode));
    }

    for (const shape of subject.shapes) {
      process(this.followingShapePaths.get(shape));
    }

    const xs = this.endFromAny.get(predicate);
    if (xs !== undefined) {
      result.addAll(xs);
    }

    return result;
  }
}

export class TypesAndShapes {
  static from(types: TermSet<RDF.Term>, shapes: TermSet<RDF.Term>): TypesAndShapes {
    const x = new TypesAndShapes();

    for (const type of types) {
      x.types.add(type);
    }

    for (const shape of shapes) {
      x.shapes.add(shape);
    }

    return x;
  }

  readonly types = new TermSet();
  readonly shapes = new TermSet();

  isEmpty() {
    return this.types.size === 0 && this.shapes.size === 0;
  }

  addAll(source: TypesAndShapes) {
    for (const srcType of source.types) {
      this.types.add(srcType);
    }

    for (const srcShape of source.shapes) {
      this.shapes.add(srcShape);
    }
  }



};
