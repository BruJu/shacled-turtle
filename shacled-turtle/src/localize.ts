
import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import * as RDF from "@rdfjs/types";
import { TurtleDirectives } from "./autocompletion-solving";
import { $quad, ns } from "./namespaces";
import * as STParser from "./Parser";

/**
 * Current term kind (SPO) position
 */
export enum SVO { Subject, Verb, Object };

/**
 * Result of a localization = on which kind of term we are in a triple
 * and what are the previous term in the SPO order.
 */
export type LocalizeResult = null
  | { currentSVO: SVO.Subject }
  | { currentSVO: SVO.Verb, currentSubject: RDF.Quad_Subject, subjectToken: string } 
  | { currentSVO: SVO.Object, currentSubject: RDF.Quad_Subject, subjectToken: string, currentPredicate: RDF.Quad_Predicate, isRdfLiteral: boolean }

/**
 * Locate on which part of a triple the given syntax node is and what are the
 * previous RDF terms (subject / predicate) inside the triple.
 * @param editorState The Code Mirror editor
 * @param currentNode The node on which the cursor is
 * @param directives Known turtle directives
 * @returns The localization result = on which term we are and where it is
 * located in the current triple (subject, predicate or object)
 */
export function localize(
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
      currentPredicate: sp.predicate,
      isRdfLiteral: firstUnit.isRdfLiteral
    };
  } else {
    return null;
  }
}

/** From a verb, find the subject */
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

/** From an object, find the predicate and the subject. */
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


/** From the node, goes to a parent subject, predicate or object node. */
function goToUnitNode(node: SyntaxNode)
: null
| { type: SVO.Subject | SVO.Verb, node: SyntaxNode }
| { type: SVO.Object, node: SyntaxNode, isRdfLiteral: boolean }  {
  let isRdfLiteral = false;

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
              return { type: SVO.Object, node: x.parent, isRdfLiteral };
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
        return { type: SVO.Object, node: x, isRdfLiteral };
      case "RDFLiteral":
        isRdfLiteral = true;
        x = x.parent;
        break;
      default:
        x = x.parent;
        break;
    }
  }
}
