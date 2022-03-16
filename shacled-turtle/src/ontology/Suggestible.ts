import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import { getWithDefault } from "../util";
import Description from "./Description";

export type Suggestion = {
  term: RDF.Term;
  description: Description;
};

class Suggestions {
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

type Data = {
  subjectTypingPredicates: Suggestions;
  existingTypes: Suggestions;
  followingTypePaths: TermMap<RDF.NamedNode, Suggestions>;
  followingShapePaths: TermMap<RDF.Term, Suggestions>;
};


export class Builder {
  data: Data = {
    subjectTypingPredicates: new Suggestions(),
    existingTypes: new Suggestions(),
    followingTypePaths: new TermMap(),
    followingShapePaths: new TermMap()
  };

  addTypingPredicate(predicate: RDF.Term, description: Description) {
    this.data.subjectTypingPredicates.add(predicate, description);
  }

  addExistingType(type: RDF.Term, description: Description) {
    this.data.existingTypes.add(type, description);
  }

  addTypePath(from: RDF.Term, predicate: RDF.NamedNode, description: Description) {
    getWithDefault(this.data.followingTypePaths, from, () => new Suggestions())
    .add(predicate, description);
  }

  addShapePath(from: RDF.Term, predicate: RDF.NamedNode, description: Description) {
    getWithDefault(this.data.followingShapePaths, from, () => new Suggestions())
    .add(predicate, description);
  }

  build(): Database {
    return new Database(this);
  }
}

export class Database {
  private readonly data: Data;

  constructor(builder: Builder) {
    this.data = builder.data;
  }

  getTypes() {
    return Suggestions.get(this.data.existingTypes);
  }

  private getAllTypingPredicates() {
    return Suggestions.get(this.data.subjectTypingPredicates);
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

    const mappedTypes = mapKind(types, this.data.followingTypePaths);
    const mappedShapes = mapKind(shapes, this.data.followingShapePaths);

    return Suggestions.get(...mappedTypes, ...mappedShapes);
  }
}
