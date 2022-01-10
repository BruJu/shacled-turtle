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

export default function autocompletionSolve(context: CompletionContext)
: null | CompletionResult {
  const tree = syntaxTree(context.state);
  const theNode: SyntaxNode | null = tree.resolve(context.pos, -1);
  if (theNode === null) return null;

  const currentHierarchyLocation = computeHierarchy(theNode);

  let cursor = theNode.cursor;

  const pathInHierarchy = goToTypeOfStatement(cursor);
  if (pathInHierarchy === null) return null;

  const situation: CurrentSituation = {
    autocompletionType: 'unknown',
    hierarchy: currentHierarchyLocation
  };

  let retval: CompletionResult | null = null;
  if (pathInHierarchy.type === TypeOfStatement.Directive) {
    situation.autocompletionType = 'directive';
    retval = directiveAutocompletion(context, cursor.node, theNode);
  } else if (pathInHierarchy.type === TypeOfStatement.Triple) {
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

  const text = extractFromCompletitionContext(context, prefix);

  const pair = Object.entries(ns).find(([prefix, _]) => prefix === text);
  if (pair === undefined) return null;


  const word = context.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);
  if (word === null) return null;

  if (cursorGoesTo(currentlyFilledNode.cursor, ["IRIREF"]) === false) {
    return null;
  }

  return {
    from: word.from,
    filter: false,
    options: [
      { label: '<' + pair[1][''].value + '>' }
    ]
  };
}



function isOnPredicate(syntaxNode: SyntaxNode) {
  const cursor = syntaxNode.cursor;

  while (true) {
    if (cursor.name === 'Verb') return true;
    if (!cursor.parent()) return false;
  }
}


enum TypeOfStatement { Triple, Directive }

function goToTypeOfStatement(cursor: TreeCursor)
: { type: TypeOfStatement, path: string } | null {
  const path = cursorGoesTo(cursor, ['Triples', 'Directive']);
  if (path === false) {
    return null;
  }

  if (cursor.type.name === 'Triples') {
    return { type: TypeOfStatement.Triple, path };
  } else if (cursor.type.name === 'Directive') {
    return { type: TypeOfStatement.Directive, path };
  } else {
    return null;
  }
}

function cursorGoesTo(cursor: TreeCursor, alternatives: string[]): string | false {
  let hierarchy = "";

  const append = (type: string) => {
    if (hierarchy.length !== 0) hierarchy += '<';
    hierarchy += type;
  };

  while (!alternatives.includes(cursor.type.name)) {
    append(cursor.type.name);

    const hasParent = cursor.parent();
    if (!hasParent) return false;
  }

  append(cursor.type.name);

  return hierarchy;
}


function computeHierarchy(syntaxNode: SyntaxNode): string {
  const cursor = syntaxNode.cursor;

  let path = cursor.name;

  while (cursor.parent()) {
    path = cursor.name + " > " + path;
  }

  return path;
}


///////////////////////////////////////////////////////////////////////////////
// For debug

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

///////////////////////////////////////////////////////////////////////////////

/**
 * Return the token completionCtx[node.from:node.to]
 */
function extractFromCompletitionContext(
  completionCtx: CompletionContext, node: SyntaxNode
) {
  return completionCtx.state.sliceDoc(node.from, node.to);
}


