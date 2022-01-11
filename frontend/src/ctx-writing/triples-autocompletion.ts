import { EditorState } from "@codemirror/state";
import { SyntaxNode, Tree } from "@lezer/common";
import { CurrentSituation, TurtleDirectives } from "./autocompletion-solving";
import namespace from '@rdfjs/namespace';
import * as RDF from '@rdfjs/types';
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { AnonymousBlankNode, syntaxNodeToTerm } from "./token-to-term";
import TermSet from "@rdfjs/term-set";
import { ns } from "../PRECNamespace";
import SuggestionDatabase from "./SuggestionDatabase";
import { termToString } from 'rdf-string';
import { DataFactory } from "n3";

let suggestions: SuggestionDatabase | null = null;
SuggestionDatabase.load(/* PREC Shacl Graph */).then(db => suggestions = db);

export async function changeShaclGraph(url: string): Promise<boolean> {
  try {
    const db = await SuggestionDatabase.load(url);
    suggestions = db;
    return true;
  } catch (err) {
    return false;
  }
}

enum SVO {
  Subject, Verb, Object,
  None,
  BlankNodePropertyList,
  Collection
};

export function tripleAutocompletion(
  compCtx: CompletionContext,
  tree: Tree,
  currentNode: SyntaxNode,
  situation: CurrentSituation
): CompletionResult | null {
  const directives = extractDirectives(compCtx.state, tree.topNode);

  const subject = getSubjectInfo(compCtx.state, directives, tree, currentNode, situation);
  if (subject === null) return null;

  const word = compCtx.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);
  if (word === null) return null;

  situation.typesOfSubject = [...subject.types];

  if (suggestions === null) return null;

  let options: Completion[] = [];

  const currentSVO = subject.currentSVO;

  if (currentSVO === SVO.Verb) {
    const subjectReq = subject.term === AnonymousBlankNode ? undefined : subject.term;
    const possiblePredicates = suggestions.getAllRelevantPathsOfType(
      subjectReq, [...subject.types], []
    );

    options = [
      { label: "rdf:type" },
      ...[...possiblePredicates].map(term => termToOption(term, directives))
    ];

  } else if (currentSVO === SVO.Object) {
    let cursor = currentNode.cursor;
    // Reach Object
    while (cursor.type.name !== 'Object') {
      if (!cursor.parent()) return null;
    }

    {
      // Collections are catched on the next while but it is cleaner
      // to explicit this case
      const c = cursor.node;
      if (c.parent && c.parent.type.name === 'Collection') {
        return null;
      }
    }
    
    // Go to corresponding verb
    // @ts-ignore 2367
    while (cursor.type.name !== 'Verb') {
      if (!cursor.prevSibling()) return null;
    }

    
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

function goToUnitNode(node: SyntaxNode): { type: SVO, node: SyntaxNode } {
  let x: SyntaxNode | null = node;
  while (true) {
    if (x === null) {
      return { type: SVO.None, node: node };
    }
    if (x.type.name === 'Subject') return { type: SVO.Subject, node: x };
    if (x.type.name === 'BlankNodePropertyList') {
      return { type: SVO.BlankNodePropertyList, node: x };
    }
    if (x.type.name === 'Verb') return { type: SVO.Verb, node: x };
    if (x.type.name === 'Object') return { type: SVO.Object, node: x };
    if (x.type.name === 'Collection') return { type: SVO.Collection, node: x };
    
    x = x.parent;
  }
}

function getSubjectInfo(
  editorState: EditorState,
  directives: TurtleDirectives,
  tree: Tree,
  currentNode: SyntaxNode,
  situation: CurrentSituation
) {
  const { type: currentSVO, node: node } = goToUnitNode(currentNode);

  if (currentSVO === SVO.None) {
    return null;
  } else if (currentSVO === SVO.Subject) {
    return null;
  }

  const subjectSyntaxNode = findSubjectSyntaxNode(node);
  if (!subjectSyntaxNode) return null;

  let subjectTerm: RDF.Term | typeof AnonymousBlankNode | null;

  if (subjectSyntaxNode.type.name === "Subject") {
    const subjectRaw = editorState.sliceDoc(subjectSyntaxNode.from, subjectSyntaxNode.to);
    situation.subjectText = subjectRaw;
    subjectTerm = syntaxNodeToTerm(editorState, directives, subjectSyntaxNode);
  } else if (subjectSyntaxNode.type.name === "BlankNodePropertyList") {
    situation.subjectText = "BlankNodePropertyList";
    subjectTerm = AnonymousBlankNode;
  } else {
    console.error("getSubjectInfo: found subject of type " + subjectSyntaxNode.type.name);
    return null;
  }

  if (subjectTerm === null) return null;

  let typesOfSubject = new TermSet();

  if (subjectTerm === AnonymousBlankNode) { // Local search
    situation.subjectTerm = DataFactory.blankNode("Anonymous");
    extractAllTypes(editorState, directives, subjectSyntaxNode, typesOfSubject);
  } else { // Search in all triples
    situation.subjectTerm = subjectTerm;
    allTypesOf(editorState, directives, tree, subjectTerm, typesOfSubject);
  }

  return { term: subjectTerm, types: typesOfSubject, currentSVO: currentSVO };
}


function findSubjectSyntaxNode(node: SyntaxNode | null) {
  while (node !== null) {
    if (node.type.name === 'BlankNodePropertyList') {
      return node;
    }

    if (node.type.name === "Triples") {
      return node.firstChild;
    }

    node = node.parent;
  }

  return null;
}

////////////////////////////////////////////////////////////////////////////////

function allTypesOf(
  editorState: EditorState,
  directives: TurtleDirectives,
  tree: Tree, term: RDF.Term, 
  destination: TermSet = new TermSet()
): TermSet {
  for (const triples of tree.topNode.getChildren("Triples")) {
    // Get the subject syntax node of this triples
    let child = triples.firstChild;
    if (child === null) continue;
    if (child.name !== 'Subject') continue;

    // Is the subject of this triple the right subject?
    const subject = syntaxNodeToTerm(editorState, directives, child);
    if (subject === null) continue;
    if (subject === AnonymousBlankNode) continue;
    if (!subject.equals(term)) continue;

    // Yes -> extract all values of rdf:type
    extractAllTypes(editorState, directives, child, destination);
  }

  return destination;
}

/**
 * `node` must be either a Subject or a BlankNodePropertyList. Its parent must
 * be a Triples.
 */
function extractAllTypes(
  editorState: EditorState,
  directives: TurtleDirectives,
  node: SyntaxNode,
  destination: TermSet = new TermSet()
): TermSet {
  if (node.name === 'BlankNodePropertyList') {

    extractAllTypesOfVerbAndObjectList(
      editorState, directives, node.firstChild, destination
    );

    if (node.parent && node.parent.type.name === "Triples") {
      extractAllTypesOfVerbAndObjectList(
        editorState, directives, node.nextSibling, destination
      );
    }

  } else if (node.name === 'Subject') {
    extractAllTypesOfVerbAndObjectList(
      editorState, directives, node.nextSibling, destination
    );
  } else {
    console.error("extractAllTypesOfPredicateObjectList called on " + node.name);
  }

  return destination;
}

function extractAllTypesOfVerbAndObjectList(
  editorState: EditorState,
  directives: TurtleDirectives,
  node: SyntaxNode | null,
  destination: TermSet = new TermSet()
) {
  let rdfType = false;

  while (node !== null) {
//    console.log(node.name);
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

    node = node.nextSibling;
  }

  return destination
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
