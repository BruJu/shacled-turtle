import { SyntaxNode } from '@lezer/common';
import * as RDF from '@rdfjs/types';
import { MetaBaseInterface } from './schema/MetaDataInterface';
import { TypesAndShapes } from './schema/SubDB-Suggestion';

/**
 * A structure that contains information about the current position.
 * 
 * Used for debugging purpose
 */
export default class DebugInformation {
  /** Type of the first node of the syntax tree */
  autoCompletionType: 'unknown' | 'triples' | 'directive' = 'unknown';
  /** Hierarchy of the current node */
  readonly hierarchy: string;

  /** Information about the subject of the currently edited triple */
  subject: null | {
    /** The text that corresponds to the subject */
    text: string;
    /** The current subject as an RDF/JS term */
    term: RDF.Term;
    /** The list of types of the subject */
    types: RDF.Term[];
    /** The list of shapes of the subject */
    shapes: RDF.Term[];
  } = null;

  object: null | {
    /** The list of types of the object */
    types: RDF.Term[];
    /** The list of shapes of the object */
    shapes: RDF.Term[];
  } = null;

  constructor(theNode: SyntaxNode) {
    this.hierarchy = computeHierarchy(theNode);
  }

  setSubject(text: string, term: RDF.Quad_Subject, meta: MetaBaseInterface) {
    this.subject = {
      text: text,
      term: term,
      types: [...meta.types.getAll(term)],
      shapes: [...meta.shapes.getAll(term)],
    };
  }

  setObject(tos: TypesAndShapes) {
    this.object = {
      types: [...tos.types],
      shapes: [...tos.shapes]
    };
  }
}


/** Return a string that represents the hierarchy to reach syntaxNode */
function computeHierarchy(syntaxNode: SyntaxNode): string {
  const cursor = syntaxNode.cursor;

  let path = cursor.name;

  while (cursor.parent()) {
    path = cursor.name + " > " + path;
  }

  return path;
}
