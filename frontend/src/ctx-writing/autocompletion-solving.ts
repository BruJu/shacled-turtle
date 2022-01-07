import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, Tree, TreeCursor } from "@lezer/common";
import namespace from '@rdfjs/namespace';
import * as RDF from '@rdfjs/types';
import SuggestionDatabase from "./SuggestionDatabase";
import * as rdfString from 'rdf-string';
import { ns } from "../PRECNamespace";
import TermSet from "@rdfjs/term-set";
import { DataFactory } from "n3";

const N3Factory = { factory: DataFactory };

let suggestions: SuggestionDatabase | null = null;

SuggestionDatabase.load(/* PREC Shacl Graph */).then(db => suggestions = db);

export type TurtleDirectives = {
  base: namespace.NamespaceBuilder<string> | null;
  prefixes: {[prefix: string]: namespace.NamespaceBuilder<string>}
};

export default function autocompletionSolve(context: CompletionContext)
: null | CompletionResult {
  const tree = syntaxTree(context.state);
  const theNode: SyntaxNode | null = tree.resolve(context.pos, -1);
  if (theNode === null) return null;

  const currentHierarchyLocation = computeHierarchy(theNode);

  const situation: CurrentSituation = { hierarchy: currentHierarchyLocation };

  let cursor = theNode.cursor;

  const pathInHierarchy = goToTypeOfStatement(cursor);
  if (pathInHierarchy === null) { return null; }
  let retval: CompletionResult | null = null;

  if (pathInHierarchy.type === TypeOfStatement.Directive) {
    retval = directiveAutocompletion(context, cursor.node, theNode);
  } else if (pathInHierarchy.type === TypeOfStatement.Triple) {
    retval = tripleAutocompletion(
      context, tree, cursor.node, theNode, situation
    );
  }

  injectSituation(situation);
  return retval;
}


function tripleAutocompletion(
  context: CompletionContext, 
  tree: Tree,
  triplesSyntaxNode: SyntaxNode,
  currentNode: SyntaxNode,
  situation: CurrentSituation
): CompletionResult | null {
  const turtleDeclarations = lookForUsedPrefixes(context, tree.topNode);
  const cursor = triplesSyntaxNode.cursor;
  cursor.firstChild();

  if (cursor.type.name !== 'Subject') return null; /* we broke rdf */

  const subjectRaw = context.state.sliceDoc(cursor.from, cursor.to);
  situation.subjectText = subjectRaw;

  const word = context.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);
  if (word === null) return null;
 
  const myElement = tokenToTerm(subjectRaw);
  let subjectTypesSet: RDF.Term[] = [];
  if (myElement) {
    situation.subjectTerm = myElement;
    const r = allTypesOf(context, turtleDeclarations, myElement, tree);
    if (r !== null) subjectTypesSet = [...r];

    situation.typesOfSubject = subjectTypesSet;
  }

  let options: Completion[] = [];
  
  if (suggestions !== null) {
    if (isOnPredicate(currentNode)) {
      let possiblePredicates = new TermSet();

      for (const type of subjectTypesSet) {
        for (const predicate of suggestions.getAllRelevantPathsOfType(type)) {
          possiblePredicates.add(predicate);
        }
      }

      options = [
        { label: "rdf:type" },
        ...[...possiblePredicates].map(term => termToOption(term, turtleDeclarations))
      ];
    } else {
      // Supported values for rdf:type
      // TODO: check if we are in the object of rdf type
      options = suggestions.getAllTypes().map(term => termToOption(term, turtleDeclarations));
    }
  }

  return { from: word.from, options, filter: false };
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

function termToOption(term: RDF.Term, turtleDeclarations: TurtleDirectives): Completion {
  if (term.termType !== 'NamedNode') {
    return { label: `${rdfString.termToString(term)}` };
  }

  for (const [prefix, builder] of Object.entries(turtleDeclarations.prefixes)) {
    const emptyTerm: RDF.NamedNode = builder[""];

    if (term.value.startsWith(emptyTerm.value)) {
      return { label: prefix + ':' + term.value.substring(emptyTerm.value.length)};
    }    
  }

  return { label: `<${rdfString.termToString(term)}>` };
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

function allTypesOf(
  context: CompletionContext,
  directives: TurtleDirectives,
  term: RDF.Term, tree: Tree
): TermSet | null {
  const types = new TermSet();

  for (const triples of tree.topNode.getChildren("Triples")) {
    let child = triples.firstChild;

    if (child === null) continue;
    if (child.name !== 'Subject') continue;

    const subject = syntaxNodeToTerm(context, directives, child);
    if (subject === null) continue;
    if (!subject.equals(term)) continue;

    let rdfType = false;

    while (true) {
      child = child.nextSibling;
      if (child === null) break;

      if (child.name === 'Verb') {
        const predicate = syntaxNodeToTerm(context, directives, child);
        rdfType = predicate !== null && ns.rdf.type.equals(predicate);
      } else if (child.name === 'Object') {
        if (rdfType) {
          const object = syntaxNodeToTerm(context, directives, child);
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
  if (token === "a") {
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

function syntaxNodeToTerm(
  context: CompletionContext,
  directives: TurtleDirectives,
  syntaxNode: SyntaxNode | null
): RDF.Term | null {
  if (syntaxNode === null) return null;

  // The syntaxNode should be a Subject, a Verb or an Object

  if (syntaxNode.name !== 'Subject'
    && syntaxNode.name !== 'Verb'
    && syntaxNode.name !== 'Object') {
    throw Error("syntaxNodeToTerm can only be used on Subject, Verb and Object, but was called on a " + syntaxNode.name);
  }

  const child = syntaxNode.firstChild
  if (child === null) return null;

  if (child.name === 'PrefixedName') {
    return prefixedNameSyntaxNodeToTerm(context, directives, child);
  } else {
    const rawText = context.state.sliceDoc(syntaxNode.from, syntaxNode.to);
    try {
      return tokenToTerm(rawText);
    } catch (_) {
      return null;
    }
  }
}

function prefixedNameSyntaxNodeToTerm(
  context: CompletionContext,
  directives: TurtleDirectives,
  node: SyntaxNode
): RDF.Term | null {
  const pnPrefixNode = node.getChild('PN_PREFIX');
  const pnLocalNode = node.getChild('PN_LOCAL');

  const prefix = pnPrefixNode === null ? "" : context.state.sliceDoc(pnPrefixNode.from, pnPrefixNode.to);
  if (pnLocalNode === null) return null;

  const localNodeText = context.state.sliceDoc(pnLocalNode.from, pnLocalNode.to);
  
  const builder = directives.prefixes[prefix];
  if (builder === undefined) return DataFactory.variable(prefix + ":" + localNodeText);
  return builder[localNodeText];
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

type CurrentSituation = {
  hierarchy?: string;
  subjectText?: string;
  subjectTerm?: RDF.Term;
  typesOfSubject?: RDF.Term[];
}

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

///////////////////////////////////////////////////////////////////////////////

function extractFromCompletitionContext(
  completionCtx: CompletionContext, node: SyntaxNode
) {
  return completionCtx.state.sliceDoc(node.from, node.to);
}

function lookForUsedPrefixes(completionCtx: CompletionContext, tree: SyntaxNode): TurtleDirectives {
  let answer: TurtleDirectives = { base: null, prefixes: {} };

  for (const directive of tree.getChildren("Directive")) {
    const child = directive.firstChild;
    if (child === null) continue;

    const iriRefNode = child.getChild("IRIREF");
    if (iriRefNode === null) continue;
    const iriStr = extractFromCompletitionContext(completionCtx, iriRefNode);
    const describedNamespace = namespace(iriStr.slice(1, iriStr.length - 1));

    if (child.name === "Base" || child.name === "SparqlBase") {
      answer.base = describedNamespace;
    } else if (child.name === "PrefixID" || child.name === "SparqlPrefix") {
      const prefixNode = child.getChild("PN_PREFIX");
      const prefix = prefixNode === null ? "" : extractFromCompletitionContext(completionCtx, prefixNode);
      answer.prefixes[prefix] = describedNamespace;
    }
  }

  return answer;
}

