import { EditorState } from "@codemirror/state";
import { SyntaxNode, Tree, TreeCursor } from "@lezer/common";
import { CurrentSituation, TurtleDirectives } from "./autocompletion-solving";
import namespace from '@rdfjs/namespace';
import * as RDF from '@rdfjs/types';
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { AnonymousBlankNode, syntaxNodeToTerm } from "./token-to-term";
import TermSet from "@rdfjs/term-set";
import { ns } from "../PRECNamespace";
import SuggestionDatabase from "./SuggestionDatabase";
import { termToString } from 'rdf-string';

let suggestions: SuggestionDatabase | null = null;
SuggestionDatabase.load(/* PREC Shacl Graph */).then(db => suggestions = db);

enum SVO { Subject, Verb, Object, None };


export function tripleAutocompletion(
  compCtx: CompletionContext,
  tree: Tree,
  triplesSyntaxNode: SyntaxNode,
  currentNode: SyntaxNode,
  situation: CurrentSituation
): CompletionResult | null {
  const directives = extractDirectives(compCtx.state, tree.topNode);

  const currentSVO = getSVOOf(currentNode);

  if (currentSVO === SVO.None) {
    return null;
  } else if (currentSVO === SVO.Subject) {
    return null;
  }

  const subject = getSubjectInfo(compCtx.state, directives,
    tree, triplesSyntaxNode, situation
  );
  if (subject === null) return null;
  if (subject.term === AnonymousBlankNode) return null;

  const word = compCtx.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);
  if (word === null) return null;

  situation.typesOfSubject = [...subject.types];

  if (suggestions === null) return null;

  let options: Completion[] = [];

  if (currentSVO === SVO.Verb) {
    let possiblePredicates = new TermSet();

    for (const type of subject.types) {
      for (const predicate of suggestions.getAllRelevantPathsOfType(type)) {
        possiblePredicates.add(predicate);
      }
    }

    options = [
      { label: "rdf:type" },
      ...[...possiblePredicates].map(term => termToOption(term, directives))
    ];

  } else if (currentSVO === SVO.Object) {
    let cursor = currentNode.cursor;
    // Reach Object
    while (cursor.type.name !== 'Object') cursor.parent();
    // Go to corresponding verb
    // @ts-ignore 2367
    while (cursor.type.name !== 'Verb') cursor.prevSibling();
    
    const t = syntaxNodeToTerm(compCtx.state, directives, cursor.node);
    if (t !== null && t !== AnonymousBlankNode && ns.rdf.type.equals(t)) {
      options = suggestions.getAllTypes().map(term => termToOption(term, directives));
    }
  } else {
    return null;
  }
 
  return { from: word.from, options, filter: false };
}


////////////////////////////////////////////////////////////////////////////////

/**
 * Extract all directives from the Turtle document
 * @param completionCtx The completition context
 * @param tree The root of the syntax tree
 * @returns The list of directives
 */
function extractDirectives(editorState: EditorState, tree: SyntaxNode): TurtleDirectives {
  let answer: TurtleDirectives = { base: null, prefixes: {} };

  for (const directive of tree.getChildren("Directive")) {
    const child = directive.firstChild;
    if (child === null) continue;

    const iriRefNode = child.getChild("IRIREF");
    if (iriRefNode === null) continue;
    const iriStr = editorState.sliceDoc(iriRefNode.from, iriRefNode.to);
    const describedNamespace = namespace(iriStr.slice(1, iriStr.length - 1));

    if (child.name === "Base" || child.name === "SparqlBase") {
      answer.base = describedNamespace;
    } else if (child.name === "PrefixID" || child.name === "SparqlPrefix") {
      const prefixNode = child.getChild("PN_PREFIX");
      const prefix = prefixNode === null ? "" : editorState.sliceDoc(prefixNode.from, prefixNode.to);
      answer.prefixes[prefix] = describedNamespace;
    }
  }

  return answer;
}


////////////////////////////////////////////////////////////////////////////////

function getSVOOf(node: SyntaxNode) {
  let x: SyntaxNode | null = node;
  while (true) {
    if (x === null) return SVO.None;
    if (x.type.name === 'Subject') return SVO.Subject;
    if (x.type.name === 'BlankNodePropertyList') return SVO.Subject;
    if (x.type.name === 'Verb') return SVO.Verb;
    if (x.type.name === 'Object') return SVO.Object;
    
    x = x.parent;
  }
}


function getSubjectInfo(
  editorState: EditorState,
  directives: TurtleDirectives,
  tree: Tree,
  triples: SyntaxNode,
  situation: CurrentSituation
) {
  const cursor = triples.cursor;
  cursor.firstChild();

  if (cursor.type.name === 'BlankNodePropertyList') {
    console.error("BlankNodePropertyList is not yet supported");
    situation.subjectText = "BlankNodePropertyList";
    return null;
  }

  if (cursor.type.name !== 'Subject') return null; /* we broke rdf */

  const subjectRaw = editorState.sliceDoc(cursor.from, cursor.to);
  situation.subjectText = subjectRaw;

  const theSubjectTerm = syntaxNodeToTerm(editorState, directives, cursor.node);

  let typesOfSubject = new TermSet();

  if (theSubjectTerm === null) {
    return null;
  } else if (theSubjectTerm === AnonymousBlankNode) {

  } else {
    situation.subjectTerm = theSubjectTerm;
    allTypesOf(editorState, directives, tree, theSubjectTerm, typesOfSubject);
  }

  return { term: theSubjectTerm, types: typesOfSubject };
}


////////////////////////////////////////////////////////////////////////////////

function allTypesOf(
  editorState: EditorState,
  directives: TurtleDirectives,
  tree: Tree, term: RDF.Term, 
  destination: TermSet = new TermSet()
): TermSet {
  for (const triples of tree.topNode.getChildren("Triples")) {
    let child = triples.firstChild;

    if (child === null) continue;
    if (child.name !== 'Subject') continue;

    const subject = syntaxNodeToTerm(editorState, directives, child);
    if (subject === null) continue;
    if (subject === AnonymousBlankNode) continue;
    if (!subject.equals(term)) continue;

    extractAllTypesOfPredicateObjectList(editorState, directives, child, destination);
  }

  return destination;
}

function extractAllTypesOfPredicateObjectList(
  editorState: EditorState,
  directives: TurtleDirectives,
  cursor: SyntaxNode,
  destination: TermSet = new TermSet()
): TermSet {
  let rdfType = false;

  let node: SyntaxNode | null = cursor; // On Subject

  while (true) {
    node = node.nextSibling;
    if (node === null) break;

    console.log(node.name);

    if (node.name === 'Verb') {
      const predicate = syntaxNodeToTerm(editorState, directives, node);
      rdfType = predicate !== null && predicate !== AnonymousBlankNode
        && ns.rdf.type.equals(predicate);
    } else if (node.name === 'Object') {
      if (rdfType) {
        const object = syntaxNodeToTerm(editorState, directives, node);
        if (object !== null && object !== AnonymousBlankNode) {
          destination.add(object);
        }
      }
    }
  }

  return destination;
}

function termToOption(term: RDF.Term, turtleDeclarations: TurtleDirectives): Completion {
  if (term.termType !== 'NamedNode') {
    return { label: `${termToString(term)}` };
  }

  for (const [prefix, builder] of Object.entries(turtleDeclarations.prefixes)) {
    const emptyTerm: RDF.NamedNode = builder[""];

    if (term.value.startsWith(emptyTerm.value)) {
      return { label: prefix + ':' + term.value.substring(emptyTerm.value.length)};
    }    
  }

  return { label: `<${termToString(term)}>` };
}
