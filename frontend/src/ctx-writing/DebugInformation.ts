import { SyntaxNode } from '@lezer/common';
import * as RDF from '@rdfjs/types';
import { termToString } from 'rdf-string';
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

  injectInDocument(document: Document) {
    const pathEl = document.getElementById('current_path');
    if (pathEl === null) return;
    
    const subjectEl = document.getElementById('current_subject')!;
    const typesEl = document.getElementById('current_subject_types')!;
  
    pathEl.innerHTML = "";
    subjectEl.innerHTML = "";
    typesEl.innerHTML = "";
  
    pathEl.appendChild(document.createTextNode(this.hierarchy));
  
    let subjectDisplay: string;
    let typesText: string;
    if (this.subject !== null) {
      subjectDisplay = this.subject.text;
      subjectDisplay += " -> " + termToString(this.subject.term);

      typesText = "Types=["
        + this.subject.types.map(term => termToString(term)).join(", ") + "]"
        + " Shapes=["
        + this.subject.shapes.map(term => termToString(term)).join(", ") + "]";
    } else {
      subjectDisplay = "No subject";
      typesText = "";
    }
  
    subjectEl.appendChild(document.createTextNode(subjectDisplay));  
    typesEl.appendChild(document.createTextNode(typesText));
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
