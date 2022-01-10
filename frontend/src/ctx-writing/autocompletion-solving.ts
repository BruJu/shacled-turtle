import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import namespace from '@rdfjs/namespace';
import * as RDF from '@rdfjs/types';
import { termToString } from "rdf-string";
import { ns } from "../PRECNamespace";
import { tripleAutocompletion } from "./triples-autocompletion";


export type TurtleDirectives = {
  base: namespace.NamespaceBuilder<string> | null;
  prefixes: {[prefix: string]: namespace.NamespaceBuilder<string>}
};

export type CurrentSituation = {
  autocompletionType: 'unknown' | 'triples' | 'directive';
  hierarchy?: string;
  subjectText?: string;
  subjectTerm?: RDF.Term;
  typesOfSubject?: RDF.Term[];
}

enum TypeOfStatement { Triple, Directive }

export default function autocompletionSolve(context: CompletionContext)
: null | CompletionResult {
  const tree = syntaxTree(context.state);
  const theNode: SyntaxNode | null = tree.resolve(context.pos, -1);
  if (theNode === null) return null;

  const currentHierarchyLocation = computeHierarchy(theNode);

  let cursor = theNode.cursor;

  const typeOfStatement = goToTypeOfStatement(cursor);
  if (typeOfStatement === null) return null;

  const situation: CurrentSituation = {
    autocompletionType: 'unknown',
    hierarchy: currentHierarchyLocation
  };

  let retval: CompletionResult | null = null;
  if (typeOfStatement === TypeOfStatement.Directive) {
    situation.autocompletionType = 'directive';
    retval = directiveAutocompletion(context, cursor.node, theNode);
  } else if (typeOfStatement === TypeOfStatement.Triple) {
    situation.autocompletionType = 'triples';
    retval = tripleAutocompletion(context, tree, cursor.node, theNode, situation);
  }

  injectSituation(situation);
  return retval;
}


function directiveAutocompletion(
  context: CompletionContext, directiveSyntaxNode: SyntaxNode,
  currentlyFilledNode: SyntaxNode
): CompletionResult | null {
  const firstChild = directiveSyntaxNode.firstChild;
  if (firstChild === null) return null;

  if (firstChild.name !== 'PrefixID' && firstChild.name !== 'SparqlPrefix') {
    return null; 
  }

  const prefix = firstChild.getChild("PN_PREFIX");
  if (prefix === null) return null;

  const text = context.state.sliceDoc(prefix.from, prefix.to);

  const pair = Object.entries(ns).find(([prefix, _]) => prefix === text);
  if (pair === undefined) return null;


  const word = context.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);
  if (word === null) return null;

  if (!cursorGoesTo(currentlyFilledNode.cursor, ["IRIREF"])) return null;

  return {
    from: word.from,
    filter: false,
    options: [
      { label: '<' + pair[1][''].value + '>' }
    ]
  };
}

///////////////////////////////////////////////////////////////////////////////

function goToTypeOfStatement(cursor: TreeCursor): TypeOfStatement | null {
  const path = cursorGoesTo(cursor, ['Triples', 'Directive']);
  if (!path) return null;
  if (cursor.type.name === 'Triples') return TypeOfStatement.Triple;
  if (cursor.type.name === 'Directive') return TypeOfStatement.Directive;
  return null;
}

function cursorGoesTo(cursor: TreeCursor, alternatives: string[]): boolean {
  while (!alternatives.includes(cursor.type.name)) {
    const hasParent = cursor.parent();
    if (!hasParent) return false;
  }

  return true;
}




///////////////////////////////////////////////////////////////////////////////
// For debug

/** Put in the HTLM the various info about the current state */
function injectSituation(currentSituation: CurrentSituation) {
  const pathEl = document.getElementById('current_path');

  if (pathEl === null) return;
  const subjectEl = document.getElementById('current_subject')!;
  const typesEl = document.getElementById('current_subject_types')!;

  pathEl.innerHTML = "";
  subjectEl.innerHTML = "";
  typesEl.innerHTML = "";

  pathEl.appendChild(document.createTextNode(currentSituation.hierarchy || "No position"));

  let subjectDisplay = "";
  if (currentSituation.subjectText) {
    subjectDisplay = currentSituation.subjectText;

    if (currentSituation.subjectTerm) {
      subjectDisplay += " -> " + termToString(currentSituation.subjectTerm);
    }  
  } else {
    subjectDisplay = "No subject";
  }

  subjectEl.appendChild(document.createTextNode(subjectDisplay));

  let typesText = "No type"
  if (currentSituation.typesOfSubject) {
    typesText = currentSituation.typesOfSubject
    .map(term => termToString(term))
    .join(", ");
  }

  typesEl.appendChild(document.createTextNode(typesText));
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

///////////////////////////////////////////////////////////////////////////////


