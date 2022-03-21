import * as n3 from 'n3';
import { termToString } from 'rdf-string';
import { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { SyntaxNode, Tree } from '@lezer/common';
import rdfNamespace from '@rdfjs/namespace';
import * as RDF from '@rdfjs/types';
import { TurtleDirectives } from './autocompletion-solving';
import { localize, SVO } from './localize';
import DebugInformation from './DebugInformation';
import { ns } from './namespaces';
import Ontology from './ontology';
import Description from './ontology/Description';
import { Suggestion } from './ontology/SubDB-Suggestion';
import * as STParser from './Parser';
import CurrentTriples from './state/CurrentState';

let suggestions: Ontology | null = null;

export function changeShaclGraph(triples: RDF.Quad[]): boolean {
  try {
    suggestions = Ontology.make(new n3.Store(triples));
    return true;
  } catch (err) {
    return false;
  }
}

export function tripleAutocompletion(
  compCtx: CompletionContext,
  tree: Tree,
  currentNode: SyntaxNode,
  situation: DebugInformation
): CompletionResult | null {
  const word = compCtx.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);

  if (word === null) return null;

  if (suggestions === null) return null;

  const { current, directives } = buildDatasetFromScratch(compCtx.state, tree.topNode, suggestions);

  const localized = localize(compCtx.state, currentNode, directives);
  if (localized === null) {
    return null;
  }

  if (localized.currentSVO === SVO.Subject) return null;

  situation.setSubject(localized.subjectToken, localized.currentSubject, current.meta);

  let options: Completion[] = [];

  if (localized.currentSVO === SVO.Verb) {
    const possiblePredicates = suggestions.suggestible.getAllPathsFor(
      current.meta.types.getAll(localized.currentSubject),
      current.meta.shapes.getAll(localized.currentSubject)
    );

    options = [
      {
        detail: termToCompletionLabel(ns.rdf.type, directives),
        label: "Type of the resource",
        apply: termToCompletionLabel(ns.rdf.type, directives)
      },
      ...suggestionsToCompletions(possiblePredicates, directives)
    ];

  } else if (localized.currentSVO === SVO.Object) {
    if (localized.currentPredicate.equals(ns.rdf.type)) {
      options = suggestionsToCompletions(suggestions.getAllTypes(), directives);
    } else {
      return null;
    }
  } else {
    return null;
  }
 
  return { from: word.from, options, filter: false };
}

function buildDatasetFromScratch(
  editorState: EditorState, tree: SyntaxNode, ontology: Ontology
): { current: CurrentTriples, directives: TurtleDirectives } {
  const currentTriples = new CurrentTriples(ontology);
  let directives: TurtleDirectives = { base: null, prefixes: {} };

  let child = tree.firstChild;

  while (child !== null) {
    if (child.type.name === "Directive") {
      readDirective(directives, editorState, child);
    } else if (child.type.name === "Triples") {
      const triples = STParser.triples(directives, editorState, child);
      triples.forEach(triple => currentTriples.add(triple));
    } else {
      // unknown type
    }

    child = child.nextSibling;
  }

  return { current: currentTriples, directives: directives };
}

////////////////////////////////////////////////////////////////////////////////

export function readDirective(known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode) {
  const child = currentNode.firstChild;
  if (child === null) return;

  const iriRefNode = child.getChild("IRIREF");
  if (iriRefNode === null) return;

  const iriStr = editorState.sliceDoc(iriRefNode.from, iriRefNode.to);
  const describedNamespace = rdfNamespace(iriStr.slice(1, iriStr.length - 1));

  if (child.name === "Base" || child.name === "SparqlBase") {
    known.base = describedNamespace;
  } else if (child.name === "PrefixID" || child.name === "SparqlPrefix") {
    const prefixNode = child.getChild("PN_PREFIX");
    const prefix = prefixNode === null ? "" : editorState.sliceDoc(prefixNode.from, prefixNode.to);
    known.prefixes[prefix] = describedNamespace;
  }
}


////////////////////////////////////////////////////////////////////////////////

function suggestionsToCompletions(suggestions: Suggestion[], directives: TurtleDirectives) {
  return suggestions.map(({term, description}) => suggestionToCompletion(term, description, directives));
}

function suggestionToCompletion(  
  iri: RDF.Term,
  description: Description,
  turtleDeclarations: TurtleDirectives
): Completion {
  let res: Completion = { label: termToCompletionLabel(iri, turtleDeclarations) };

  function getStrings(type: 'labels' | 'comments') {
    const field = description[type];
    if (field === undefined) return undefined;
    if (field.size === 0) return undefined;
    return [...field].map(literal => literal.value);
  }

  
  const info = getStrings('labels');
  if (info) {
    const oldLabel = res.label;
    res.label = info.join(" / ");
    res.detail = oldLabel;
    res.apply = oldLabel;
  }

  const descriptions = getStrings('comments');
  if (descriptions) res.info = descriptions.join("<br>");

  return res;
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
