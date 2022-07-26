import TermMap from "@rdfjs/term-map";
import * as RDF from "@rdfjs/types";
import { getWithDefault } from "../../util";
import Description from "../Description";
import SuggestionEngine, { PossiblePredicates, TypesAndShapes } from "../SuggestionEngine";

/**
 * Builder for the suggestion database
 */
export default class SuggestionEnegineBuilder {
  /** List of predicates that gives a type or a shape to the subject */
  readonly subjectTypingPredicates = new PossiblePredicates();
  /** List of types that exist in the system */
  readonly existingTypes = new PossiblePredicates();
  /** List of possible predicates for all known types */
  readonly followingTypePaths = new TermMap<RDF.NamedNode, PossiblePredicates>();
  /** List of possible predicates for all known shapes */
  readonly followingShapePaths = new TermMap<RDF.Term, PossiblePredicates>();
  /** Types and shapes that the object might have for a given predicate, without consideration on the subject */
  readonly endFromAny = new TermMap<RDF.Term, TypesAndShapes>();

  /** Tells that the given predicate enables to type the resource (typically thanks to rdfs:domain or sh:subjectsOf) */
  addTypingPredicate(predicate: RDF.Term, description: Description) {
    this.subjectTypingPredicates.add(predicate, description);
  }

  /** Tells that a resource is a type */
  addExistingType(type: RDF.Term, description: Description) {
    this.existingTypes.add(type, description);
  }

  /** Resources of type `from` should have `predicate` suggested */
  addTypePath(from: RDF.Term, predicate: RDF.NamedNode, description: Description) {
    getWithDefault(this.followingTypePaths, from, () => new PossiblePredicates())
    .add(predicate, description);
  }

  /** Resources of shape `from` should have `predicate` suggested */
  addShapePath(from: RDF.Term, predicate: RDF.NamedNode, description: Description) {
    getWithDefault(this.followingShapePaths, from, () => new PossiblePredicates())
    .add(predicate, description);
  }

  /**
   * For any subject (null) or if the subject has a given shape, for a given
   * predicate, suggest the list of objects that has the type or shape described
   * by target
   */
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
        () => new PossiblePredicates()
      );
      
      where = suggestions.getAfterPath(predicate, true)!;
    }

    if ('type' in target) {
      where.types.add(target.type);
    } else {
      where.shapes.add(target.shape);
    }
  }

  build(): SuggestionEngine {
    return new SuggestionEngine(this);
  }
}
