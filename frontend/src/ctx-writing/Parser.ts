import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { DataFactory } from "n3";
import { ns, $quad } from "../PRECNamespace";
import { TurtleDirectives } from "./autocompletion-solving";
import * as RDF from "@rdfjs/types";
import { prefixedNameSyntaxNodeToTerm } from "./token-to-term";

type TriplesReadResult<Term = RDF.Term>
  = null
  | { readValue: Term, nestedTriples: RDF.Quad[] };

export function triples(
  known: TurtleDirectives, editorState: EditorState,
  node: SyntaxNode
): RDF.Quad[] {
  const child = node.firstChild;
  if (child === null) return [];

  let r: TriplesReadResult<RDF.Quad_Subject>;

  if (child.type.name === 'Subject' || child.type.name === 'QtSubject') {
    r = subject(known, editorState, child);
  } else if (child.type.name === 'BlankNodePropertyList') {
    r = blankNodePropertyList(known, editorState, child);
  } else {
    // Unknown child type (probably error type)
    return [];
  }

  if (r === null) return [];

  const pol = child.nextSibling;
  if (pol === null) return r.nestedTriples;

  const quadsFromPOL = predicateObjectList(known, editorState, r.readValue, child);

  r.nestedTriples.push(...quadsFromPOL);

  return r.nestedTriples;
}


export function subject(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.Quad_Subject> {
  return object(known, editorState, currentNode) as TriplesReadResult<RDF.Quad_Subject>;
}

export function blankNodePropertyList(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.BlankNode> {
  const uniqueName = "_shacledturtle_bn-" + currentNode.from + "~" + currentNode.to
  const self = DataFactory.blankNode(uniqueName);

  const polNode = currentNode.firstChild;
  if (polNode === null) {
    return { readValue: self, nestedTriples: [] };
  }

  const quads = predicateObjectList(known, editorState, self, polNode);
  return { readValue: self, nestedTriples: quads };
}

function quotedTriple(
  known: TurtleDirectives, editorState: EditorState,
  node: SyntaxNode
): null | { readValue: RDF.Quad, nestedTriples: [] } {
  const r = triples(known, editorState, node);
  if (r.length !== 1) {
    if (r.length > 1) {
      console.error("More than one result for Subject QtTriple");
    }
    return null;
  }

  return { readValue: r[0], nestedTriples: [] };
}

function collection(
  known: TurtleDirectives, editorState: EditorState,
  currentNode: SyntaxNode
): TriplesReadResult<RDF.NamedNode | RDF.BlankNode> {
  const uniqueName = "_shacledturtle_col-" + currentNode.from + "~" + currentNode.to

  // Read objects
  const objects: { start: number, end: number, value: RDF.Quad_Object }[] = [];
  let quads: RDF.Quad[] = [];

  let child = currentNode.firstChild;
  while (child !== null) {
    const r = object(known, editorState, child);
    if (r === null) break;

    objects.push({ start: child.from, end: child.to, value: r.readValue });
    quads.push(...r.nestedTriples);

    child = child.nextSibling;
  }

  let head: RDF.NamedNode | RDF.BlankNode = ns.rdf.nil;

  for (let i = 0; i != objects.length; ++i) {
    let reverseI = objects.length - i - 1;
    const { start, end, value } = objects[reverseI];
    let generatedName = uniqueName + "#" + start + "~" + end;
    let newHead = DataFactory.blankNode(generatedName);

    quads.push(
      $quad(newHead, ns.rdf.first, value),
      $quad(newHead, ns.rdf.rest, head)
    );

    head = newHead;
  }

  // Return
  return { readValue: head, nestedTriples: quads };
}

function predicateObjectList(
  known: TurtleDirectives, editorState: EditorState,
  subject: RDF.Quad_Subject, node: SyntaxNode    
): RDF.Quad[] {
  let production: RDF.Quad[] = [];

  let currentVerb: RDF.Quad_Predicate | null = null;
  let currentObject: RDF.Quad_Object | null = null;

  let focus: SyntaxNode | null = node;
  for (; focus !== null; focus = focus.nextSibling) {
    if (focus.type.name === "Verb") {
      currentObject = null;

      const r = verb(known, editorState, focus);
      if (r === null) {
        currentVerb = null;
      } else {
        currentVerb = r.readValue;
        production.push(...r.nestedTriples);
      }
    } else if (focus.type.name === "Object") {
      const r = object(known, editorState, focus);
      if (r === null) {
        currentObject = null;
      } else {
        currentObject = r.readValue;
        production.push(...r.nestedTriples);
        
        if (currentVerb !== null) {
          production.push($quad(subject, currentVerb, currentObject));
        }
      }
    } else if (focus.type.name === "Annotation") {
      if (currentVerb === null || currentObject === null) continue;

      const quad = $quad(subject, currentVerb, currentObject);
      production.push(...annotation(known, editorState, focus, quad));
    } else {
      continue;
    }
  }

  return production;
}

export function verb(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.NamedNode> {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);
  if (token === "a") {
    return { readValue: ns.rdf.type, nestedTriples: [] };
  }

  // predicate -> iri
  const child = currentNode.firstChild;
  if (child === null) return null;

  if (child.type.name === "IRIREF") {
    return iriref(known, editorState, child);
  } else if (child.type.name === "PrefixedName") {
    return prefixedName(known, editorState, child);
  } else {
    return null;
  }
}

export function object(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.Quad_Object> {
  const inner = currentNode.firstChild;
  if (inner === null) return null;

  switch (inner.type.name) {
    case "IRIREF":
      return iriref(known, editorState, inner);
    case "PrefixedName":
      return prefixedName(known, editorState, inner);
    case "BlankNode":
      return blankNode(editorState, inner);
    case "BlankNodePropertyList":
      return blankNodePropertyList(known, editorState, inner);
    case "Anon":
      return anon(inner);
    case "Collection":
      return collection(known, editorState, inner);
    case "QuotedTriple":
      return quotedTriple(known, editorState, inner);
    case 'RDFLiteral':
      return rdfLiteral(known, editorState, inner);
    case 'NumericLiteral':
      return numericLiteral(editorState, inner);
    case 'BooleanLiteral':
      return booleanLiteral(editorState, inner);
    default:
      return null;
  }
}

function annotation(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode, subject: RDF.Quad
): RDF.Quad[] {
  const child = currentNode.firstChild;
  if (child === null) return [];
  return predicateObjectList(known, editorState, subject, child);
}

function iriref(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
) {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);
  return {
    readValue: DataFactory.namedNode(token.slice(1, token.length - 1)),
    nestedTriples: []
  };
}

function prefixedName(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
) {
  const r = prefixedNameSyntaxNodeToTerm(editorState, known, currentNode);
  if (r === null) return null;

  return {
    readValue: r,
    nestedTriples: []
  } as TriplesReadResult<RDF.NamedNode>;
}


function blankNode(
  editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.BlankNode> {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);
  if (token.startsWith("_:")) {
    const node = DataFactory.blankNode(token.slice(2));
    return { readValue: node, nestedTriples: [] };
  }
  return null;
}

function anon(currentNode: SyntaxNode): TriplesReadResult<RDF.BlankNode> {
  const uniqueName = "_shacledturtle_anon-" + currentNode.from + "~" + currentNode.to
  return { readValue: DataFactory.blankNode(uniqueName), nestedTriples: [] };
}

function rdfLiteral(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
) {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);
  return wrapLiteral(DataFactory.literal(token));
}

function numericLiteral(
  editorState: EditorState, currentNode: SyntaxNode
) {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);

  try {
    const value = parseInt(token);
    const literal = DataFactory.literal(value);
    return wrapLiteral(literal);
  } catch (_) {
    return null;
  }
}

function booleanLiteral(
  editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.Literal> {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);
  
  if (token === "true") {
    return wrapLiteral(DataFactory.literal("true", ns.xsd.boolean));
  } else if (token === "false") {
    return wrapLiteral(DataFactory.literal("false", ns.xsd.boolean));
  }

  return null;
}

function wrapLiteral(literal: RDF.Literal | null): TriplesReadResult<RDF.Literal> {
  if (literal === null) return null;
  return { readValue: literal, nestedTriples: [] };
}
