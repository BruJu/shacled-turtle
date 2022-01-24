import { EditorState } from "@codemirror/state";
import { SyntaxNode, Tree } from "@lezer/common";
import { CurrentSituation, TurtleDirectives } from "./autocompletion-solving";
import namespace from '@rdfjs/namespace';
import * as RDF from '@rdfjs/types';
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { AnonymousBlankNode, syntaxNodeToTerm } from "./token-to-term";
import TermSet from "@rdfjs/term-set";
import { ns } from "../PRECNamespace";
import SuggestionDatabase, { mergeAll, PathDescription, PathInfo, SuggestableType } from "./SuggestionDatabase";
import { termToString } from 'rdf-string';
import { DataFactory } from "n3";
import { Description } from "./OntologyGraph";

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

type CurrentNodeAnalysis = {
  types: TermSet;
  subjectOf: TermSet;
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

  situation.typesOfSubject = [...subject.analysis.types];

  if (suggestions === null) return null;

  let options: Completion[] = [];

  const currentSVO = subject.currentSVO;

  if (currentSVO === SVO.Verb) {
    const subjectReq = subject.term === AnonymousBlankNode ? undefined : subject.term;
    const possiblePredicates = suggestions.getAllRelevantPathsOfType(
      subjectReq, subject.analysis.types, subject.analysis.subjectOf
    );

    options = [
      {
        detail: termToCompletionLabel(ns.rdf.type, directives),
        label: "Type of the resource",
        apply: termToCompletionLabel(ns.rdf.type, directives)
      },
      ...[...possiblePredicates].map(path => pathToOption(path, directives))
    ];

  } else if (currentSVO === SVO.Object) {
    let cursor = currentNode.cursor;
    // Reach Object
    while (cursor.type.name !== 'Object' && cursor.type.name !== 'QtObject') {
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
      options = suggestions.getAllTypes().map(term => typeToOption(term, directives));
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
    if (x.type.name === 'QtSubject') return { type: SVO.Subject, node: x };
    if (x.type.name === 'BlankNodePropertyList') {
      return { type: SVO.BlankNodePropertyList, node: x };
    }
    if (x.type.name === 'Verb') return { type: SVO.Verb, node: x };
    if (x.type.name === 'Object') return { type: SVO.Object, node: x };
    if (x.type.name === 'QtObject') return { type: SVO.Object, node: x };
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

  if (subjectSyntaxNode.type.name === "Subject" || subjectSyntaxNode.type.name == "QtSubject") {
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

  let analysis: CurrentNodeAnalysis = {
    types: new TermSet(), subjectOf: new TermSet()
  };

  if (subjectTerm === AnonymousBlankNode) { // Local search
    situation.subjectTerm = DataFactory.blankNode("Anonymous");
    extractAllTypes(editorState, directives, subjectSyntaxNode, analysis);
  } else { // Search in all triples
    situation.subjectTerm = subjectTerm;
    allTypesOf(editorState, directives, tree, subjectTerm, analysis);
  }

  return { term: subjectTerm, analysis: analysis, currentSVO: currentSVO };
}


function findSubjectSyntaxNode(node: SyntaxNode | null) {
  while (node !== null) {
    if (node.type.name === 'Annotation') {
      // Autocompletion inside annotations is not supported
      return null;
    }

    if (node.type.name === 'BlankNodePropertyList') {
      return node;
    }

    if (node.type.name === "Triples" || node.type.name === "QuotedTriple") {
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
  destination: CurrentNodeAnalysis
) {
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
}

/**
 * `node` must be either a Subject or a BlankNodePropertyList. Its parent must
 * be a Triples.
 */
function extractAllTypes(
  editorState: EditorState,
  directives: TurtleDirectives,
  node: SyntaxNode,
  destination: CurrentNodeAnalysis
) {
  if (node.name === 'BlankNodePropertyList') {

    extractAllTypesOfVerbAndObjectList(
      editorState, directives, node.firstChild, destination
    );

    if (node.parent && (node.parent.type.name === "Triples" || node.parent.type.name === 'QuotedTriple')) {
      extractAllTypesOfVerbAndObjectList(
        editorState, directives, node.nextSibling, destination
      );
    }

  } else if (node.name === 'Subject' || node.name === 'QtSubject') {
    extractAllTypesOfVerbAndObjectList(
      editorState, directives, node.nextSibling, destination
    );
  } else {
    console.error("extractAllTypesOfPredicateObjectList called on " + node.name);
  }
}

function extractAllTypesOfVerbAndObjectList(
  editorState: EditorState,
  directives: TurtleDirectives,
  node: SyntaxNode | null,
  destination: CurrentNodeAnalysis
) {
  let rdfType = false;

  while (node !== null) {
//    console.log(node.name);
    if (node.name === 'Verb') {
      const predicate = syntaxNodeToTerm(editorState, directives, node);

      if (predicate !== null && predicate !== AnonymousBlankNode) {
        destination.subjectOf.add(predicate);
        rdfType = ns.rdf.type.equals(predicate);
      } else {
        rdfType = false;
      }
    } else if (node.name === 'Object' || node.name === 'QtObject') {
      if (rdfType) {
        const object = syntaxNodeToTerm(editorState, directives, node);
        if (object !== null && object !== AnonymousBlankNode) {
          destination.types.add(object);
        }
      }
    } else if (node.name === 'Annotation') {
      // skip because it concerns another triple. Currently no autocompletion
      // is supported in annotations
    }

    node = node.nextSibling;
  }

  return destination
}

function termToOption(term: RDF.Term, turtleDeclarations: TurtleDirectives): Completion {
  return { label: termToCompletionLabel(term, turtleDeclarations) };
}

function pathToOption([iri, infos]: [RDF.Term, Description], turtleDeclarations: TurtleDirectives): Completion {
  return toOption(
    iri,
    {
      labels: [...infos.labels],
      descriptions: [...infos.comments]
    },
    turtleDeclarations
  )
}

function toOption(
  iri: RDF.Term,
  description: PathDescription,
  turtleDeclarations: TurtleDirectives
): Completion {
  let res: Completion = { label: termToCompletionLabel(iri, turtleDeclarations) };

  function getStrings(type: 'labels' | 'descriptions') {
    const field = description[type];
    if (field === undefined) return undefined;

    const labels = new TermSet<RDF.Literal>(
      field //.filter(literal => literal.datatype.equals(ns.xsd.string))
    );

    if (labels.size === 0) return undefined;
    return [...labels].map(literal => literal.value);
  }

  
  const info = getStrings('labels');
  if (info) {
    const oldLabel = res.label;
    res.label = info.join(" / ");
    res.detail = oldLabel;
    res.apply = oldLabel;
  }

  const descriptions = getStrings('descriptions');
  if (descriptions) res.info = descriptions.join("<br>");

  return res;
}

function typeToOption(type: SuggestableType, directives: TurtleDirectives) {
  return toOption(type.class, type.info, directives);
}

function termToCompletionLabel(term: RDF.Term, directives: TurtleDirectives): string {
  if (term.termType !== 'NamedNode') return termToString(term);

  for (const [prefix, builder] of Object.entries(directives.prefixes)) {
    const emptyTerm: RDF.NamedNode = builder[""];

    if (term.value.startsWith(emptyTerm.value)) {
      return prefix + ':' + term.value.substring(emptyTerm.value.length);
    }    
  }

  return `<${termToString(term)}>`;
}
