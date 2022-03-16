import { EditorState } from "@codemirror/state";
import { SyntaxNode, Tree } from "@lezer/common";
import { TurtleDirectives } from "./autocompletion-solving";
import rdfNamespace from '@rdfjs/namespace';
import * as RDF from '@rdfjs/types';
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { $quad, ns } from "./namespaces";
import SuggestionDatabase from "./SuggestionDatabase";
import { termToString } from 'rdf-string';
import Description from "./ontology/Description";
import { Suggestion } from "./ontology/Suggestible";
import * as STParser from "./Parser";
import CurrentTriples from "./state/CurrentState";
import Ontology from "./ontology/OntologyBuilder";
import DebugInformation from "./DebugInformation";

let suggestions: SuggestionDatabase | null = null;

export function changeShaclGraph(triples: RDF.Quad[]): boolean {
  try {
    suggestions = new SuggestionDatabase(triples)
    return true;
  } catch (err) {
    return false;
  }
}

enum SVO { Subject, Verb, Object };

export function tripleAutocompletion(
  compCtx: CompletionContext,
  tree: Tree,
  currentNode: SyntaxNode,
  situation: DebugInformation
): CompletionResult | null {
  const word = compCtx.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);
  console.log("word");
  if (word === null) return null;
  console.log("suggestions");
  if (suggestions === null) return null;

  const { current, directives } = buildDatasetFromScratch(compCtx.state, tree.topNode, suggestions.ontology);
  console.log("localize");
  const localized = localize(compCtx.state, currentNode, directives);
  if (localized === null) {
    return null;
  }
  console.log("SVOSUbject");
  if (localized.currentSVO === SVO.Subject) return null;

  situation.setSubject(localized.subjectToken, localized.currentSubject, current.meta);

  let options: Completion[] = [];

  if (localized.currentSVO === SVO.Verb) {
    const possiblePredicates = suggestions.ontology.suggestible.getAllPathsFor(
      current.meta.types.getAll(localized.currentSubject),
      current.meta.shapes.getAll(localized.currentSubject)
    );

    options = [
      {
        detail: termToCompletionLabel(ns.rdf.type, directives),
        label: "Type of the resource",
        apply: termToCompletionLabel(ns.rdf.type, directives)
      },
      ...[...possiblePredicates].map(path => pathToOption(path, directives))
    ];

  } else if (localized.currentSVO === SVO.Object) {
    if (localized.currentPredicate.equals(ns.rdf.type)) {
      options = suggestions.getAllTypes().map(term => typeToOption(term, directives));
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

function readDirective(known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode) {
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

type LocalizeResult = null
  | { currentSVO: SVO.Subject }
  | { currentSVO: SVO.Verb, currentSubject: RDF.Quad_Subject, subjectToken: string } 
  | { currentSVO: SVO.Object, currentSubject: RDF.Quad_Subject, subjectToken: string, currentPredicate: RDF.Quad_Predicate };

function localize(
  editorState: EditorState, currentNode: SyntaxNode | null, directives: TurtleDirectives
): LocalizeResult {
  if (currentNode === null) return null;

  const firstUnit = goToUnitNode(currentNode);
  if (firstUnit === null) return null;

  if (firstUnit.type === SVO.Subject) {
    return { currentSVO: SVO.Subject };
  } else if (firstUnit.type === SVO.Verb) {
    const subject = localizeReadSubject(directives, editorState, firstUnit.node);
    if (subject === null) return null;
    return {
      currentSVO: SVO.Verb,
      currentSubject: subject.term,
      subjectToken: subject.token
    };
  } else if (firstUnit.type === SVO.Object) {
    const sp = localizeReadSubjectPredicate(directives, editorState, firstUnit.node);
    if (sp === null) return null;
    return {
      currentSVO: SVO.Object,
      currentSubject: sp.subject,
      subjectToken: sp.subjectToken,
      currentPredicate: sp.predicate
    };
  } else {
    return null;
  }
}


function localizeReadSubject(directives: TurtleDirectives, editorState: EditorState, node: SyntaxNode)
: null | { term: RDF.Quad_Subject, token: string } {
  if (node.type.name !== 'Verb') {
    console.error("Assertion error - localizeReadSubject: not on a verb");
    return null;
  }

  const parent = node.parent;
  if (parent === null) {
    console.error("Assertion error - localizeReadSubject: no parent");
    return null;
  }

  switch (parent.type.name) {
    case "Triples":
    case "QuotedTriple": {
      let sister: SyntaxNode | null = node;

      while (true) {
        sister = sister.prevSibling;
        if (sister === null) {
          return null;
        }

        if (sister.type.name === "QtSubject" || sister.type.name === "Subject") {
          break;
        }
      }

      const s = STParser.subject(directives, editorState, sister);
      const token = editorState.sliceDoc(sister.from, sister.to);
      return s === null ? null : { term: s.readValue, token: token };
    }
    case "BlankNodePropertyList": {
      const s = STParser.blankNodePropertyList(directives, editorState, parent);
      const token = editorState.sliceDoc(parent.from, parent.to);
      return s === null ? null : { term: s.readValue, token: token };
    }
    case "Annotation": {
      let sister: SyntaxNode | null = parent;

      while (true) {
        sister = sister.prevSibling;
        if (sister === null) return null;

        if (sister.type.name === "Object") break;
      }

      const o = STParser.object(directives, editorState, sister);
      if (o === null) return null;

      const sp = localizeReadSubjectPredicate(directives, editorState, sister);
      if (sp === null) return null;

      return { term: $quad(sp.subject, sp.predicate, o.readValue), token: "(annotation)" };
    }
    default:
      return null;
  }
}

function localizeReadSubjectPredicate(
  directives: TurtleDirectives, editorState: EditorState, node: SyntaxNode
): null | { subject: RDF.Quad_Subject, subjectToken: string, predicate: RDF.Quad_Predicate } {
  if (node.type.name !== 'Object' && node.type.name !== 'QtObject') {
    console.error("Assertion error - localizeReadSubject: not on an object");
    return null;
  }

  if (node.parent !== null && node.parent.type.name === "Collection") {
    const token = editorState.sliceDoc(node.parent.from, node.parent.to)
      + "[" + editorState.sliceDoc(node.from, node.to) + "]";
    return {
      subject: STParser.getCollectionElementNode(node),
      subjectToken: token,
      predicate: ns.rdf.first
    };
  }

  let sister: SyntaxNode | null = node;

  while (true) {
    sister = sister.prevSibling;
    if (sister === null) return null;
    if (sister.type.name === "Verb") break;
  }

  const predicate = STParser.verb(directives, editorState, sister);
  if (predicate === null) {
    console.error("No verb in ReadSubjectPredicate");
    return null;
  }

  const subject = localizeReadSubject(directives, editorState, sister);
  if (subject === null) return null;
  return { subject: subject.term, subjectToken: subject.token, predicate: predicate.readValue };
}

function goToUnitNode(node: SyntaxNode): null | { type: SVO, node: SyntaxNode } {
  let x: SyntaxNode | null = node;
  while (true) {
    if (x === null) return null;

    switch (x.type.name) {
      case "Subject":
      case "QtSubject":
        return { type: SVO.Subject, node: x };
      case "BlankNodePropertyList": {
        if (x.parent) {
          switch (x.parent.name) {
            case "Subject":
            case "QtSubject":
              return { type: SVO.Subject, node: x.parent };
            case "Triples":
              return { type: SVO.Subject, node: x };
            case "Object":
            case "QtObject":
              return { type: SVO.Object, node: x.parent };
            default:
              return null;
          }
        } else {
          return null;
        }
      }
      case "Verb":
        return { type: SVO.Verb, node: x };
      case "Object":
      case "QtObject":
        return { type: SVO.Object, node: x };
      default:
        x = x.parent;
        break;
    }
  }
}

function pathToOption(suggestion: Suggestion, turtleDeclarations: TurtleDirectives): Completion {
  return toOption(
    suggestion.term,
    suggestion.description,
    turtleDeclarations
  )
}

function toOption(
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

function typeToOption(type: Suggestion, directives: TurtleDirectives) {
  return toOption(type.term, type.description, directives);
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