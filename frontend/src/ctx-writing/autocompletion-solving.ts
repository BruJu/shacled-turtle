import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, Tree, TreeCursor } from "@lezer/common";
import * as RDF from '@rdfjs/types';
import SuggestionDatabase from "./SuggestionDatabase";
import * as rdfString from 'rdf-string';
import { ns } from "../PRECNamespace";
import TermSet from "@rdfjs/term-set";
import { DataFactory } from "n3";

let suggestions: SuggestionDatabase | null = null;

SuggestionDatabase.load(/* PREC Shacl Graph */).then(db => suggestions = db);

export default function autocompletionSolve(context: CompletionContext)
: null | CompletionResult {
  const tree = syntaxTree(context.state);
  const theNode: SyntaxNode | null = tree.resolve(context.pos, -1);

  if (theNode === null) return null;

  let cursor = theNode.cursor;

  // const typeAtCurrentPosition = cursor.type.name;

//  const spo = goToSPO(cursor);
//  if (spo === false) return null;
//
//  const spoType = cursor.type.name;
//  const spoStart = cursor.from;
//  const spoEnd = cursor.to;

  const hierarchyToReachParentTriple = goToTriple(cursor);

  if (hierarchyToReachParentTriple === false) return null;

  cursor.firstChild();

  if (cursor.type.name !== 'Subject') return null; /* we broke rdf */

  const subjectRaw = context.state.sliceDoc(cursor.from, cursor.to);

  const word = context.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);
  if (word === null) return null;

  let cursorHierarchy = theNode.cursor;
  let hier = theNode.name;
  while (cursorHierarchy.parent()) {
    hier = cursorHierarchy.name + ">" + hier;
  }

  
  const myElement = tokenToTerm(subjectRaw);
  let subjectTypesSet: RDF.Term[] = [];
  if (myElement) {
    const r = allTypesOf(context, myElement, tree);
    if (r !== null) subjectTypesSet = [...r];
  }

  injectSituation({
    hierarchy: hier,
    subjectText: subjectRaw,
    subjectTerm: myElement || undefined,
    typesOfSubject: subjectTypesSet
  });


  let options: Completion[] = [];
  
  if (suggestions !== null) {
    options = suggestions.getAllTypes().map(termToOption);

    if (isOnPredicate(theNode)) {
      let possiblePredicates = new TermSet();

      for (const type of subjectTypesSet) {
        for (const predicate of suggestions.getAllRelevantPathsOfType(type)) {
          possiblePredicates.add(predicate);
        }
      }

      options = [
        { label: "rdf:type" },
        ...[...possiblePredicates].map(termToOption)
      ];
    }
  }

  return { from: word.from, options, filter: false };
}

function termToOption(term: RDF.Term): Completion {
  return { label: `<${rdfString.termToString(term)}>` };
}

function isOnPredicate(syntaxNode: SyntaxNode) {
  const cursor = syntaxNode.cursor;

  while (true) {
    if (cursor.name === 'Verb') return true;
    if (!cursor.parent()) return false;
  }
}


function goToSPO(cursor: TreeCursor): string | false {
  return cursorGoesTo(cursor, ['Verb', 'Object']);
}

function goToTriple(cursor: TreeCursor): string | false {
  return cursorGoesTo(cursor, ['Triples']);
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

function allTypesOf(context: CompletionContext, term: RDF.Term, tree: Tree): TermSet | null {
  const types = new TermSet();

  for (const triples of tree.topNode.getChildren("Triples")) {
    let child = triples.firstChild;

    if (child === null) continue;
    if (child.name !== 'Subject') continue;

    const subject = syntaxNodeToTerm(context, child);
    if (subject === null) continue;
    if (!subject.equals(term)) continue;

    let rdfType = false;

    while (true) {
      child = child.nextSibling;
      if (child === null) break;

      if (child.name === 'Verb') {
        const predicate = syntaxNodeToTerm(context, child);
        rdfType = predicate !== null && ns.rdf.type.equals(predicate);
      } else if (child.name === 'Object') {
        if (rdfType) {
          const object = syntaxNodeToTerm(context, child);
          if (object !== null) {
            types.add(object);
          }
        }
      }
    }
  }

  return types;
}

function tokenToTerm(token: string): RDF.Term | null {
  // TODO: add prefixes
  if (token === "rdf:type" || token === "a") {
    return ns.rdf.type;
  }

  if (token.startsWith("<") && token.endsWith(">")) {
    return rdfString.stringToTerm(token.substring(1, token.length - 1));
  } else if (token.startsWith("_:")) {
    return DataFactory.blankNode(token.slice(2));
  } else {
    return null;
  }
}

function syntaxNodeToTerm(context: CompletionContext, syntaxNode: SyntaxNode | null)
: RDF.Term | null {
  if (syntaxNode === null) return null;

  try {
    const rawText = context.state.sliceDoc(syntaxNode.from, syntaxNode.to);
    return tokenToTerm(rawText);
  } catch (_) {
    return null;
  }
}


///////////////////////////////////////////////////////////////////////////////
// For debug

type CurrentSituation = {
  hierarchy?: string;
  subjectText?: string;
  subjectTerm?: RDF.Term;
  typesOfSubject?: RDF.Term[];
}

function injectSituation(currentSituation: CurrentSituation) {
  const pathEl = document.getElementById('current_path')!;
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
      subjectDisplay += " -> " + rdfString.termToString(currentSituation.subjectTerm);
    }  
  } else {
    subjectDisplay = "No subject";
  }

  subjectEl.appendChild(document.createTextNode(subjectDisplay));

  let typesText = "No type"
  if (currentSituation.typesOfSubject) {
    typesText = currentSituation.typesOfSubject
    .map(term => rdfString.termToString(term))
    .join(", ");
  }

  typesEl.appendChild(document.createTextNode(typesText));
}

