import { SyntaxNode } from '@lezer/common';
import * as RDF from '@rdfjs/types';
import DoubleMeta from './state/DoubleMeta';

export default class DebugInformation {
  autoCompletionType: 'unknown' | 'triples' | 'directive' = 'unknown';
  readonly hierarchy: string;

  subject: null | {
    text: string;
    term: RDF.Term;
    types: RDF.Term[];
    shapes: RDF.Term[];
  } = null;

  constructor(theNode: SyntaxNode) {
    this.hierarchy = computeHierarchy(theNode);
  }

  setSubject(text: string, term: RDF.Quad_Subject, meta: DoubleMeta) {
    this.subject = {
      text: text,
      term: term,
      types: [...meta.types.getAll(term)],
      shapes: [...meta.shapes.getAll(term)],
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
