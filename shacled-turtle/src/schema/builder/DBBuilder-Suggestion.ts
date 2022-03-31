import TermMap from "@rdfjs/term-map";
import * as RDF from "@rdfjs/types";
import { getWithDefault } from "../../util";
import Description from "../Description";
import SuggestionDatabase, { Suggestions, TypesAndShapes } from "../SubDB-Suggestion";

/**
 * Builder for the suggestion database
 */
export default class SuggestionDBBuilder {
  readonly subjectTypingPredicates = new Suggestions();
  readonly existingTypes = new Suggestions();
  readonly followingTypePaths = new TermMap<RDF.NamedNode, Suggestions>();
  readonly followingShapePaths = new TermMap<RDF.Term, Suggestions>();
  readonly endFromAny = new TermMap<RDF.Term, TypesAndShapes>();

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

  addTypePathTarget(
    source: null | { shape: RDF.Term },
    predicate: RDF.NamedNode,
    target: { type: RDF.Term } | { shape: RDF.Term }
  ) {
    let where: TypesAndShapes;

    if (source === null) {
      where = getWithDefault(this.endFromAny, predicate, () => new TypesAndShapes());
    } else {
      const suggestions = getWithDefault(
        this.followingShapePaths, source.shape,
        () => new Suggestions()
      );
      
      where = suggestions.getAfterPath(predicate, true)!;
    }

    if ('type' in target) {
      where.types.add(target.type);
    } else {
      where.shapes.add(target.shape);
    }
  }

  build(): SuggestionDatabase {
    return new SuggestionDatabase(this);
  }
}
