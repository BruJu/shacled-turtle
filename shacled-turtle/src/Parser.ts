import { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";
import { DataFactory } from "n3";
import { ns, $quad } from "./namespaces";
import { TurtleDirectives } from "./autocompletion-solving";
import * as RDF from "@rdfjs/types";

/** Either null or an RDF/JS term and the contained triples */
type TriplesReadResult<Term = RDF.Term>
  = null | { readValue: Term, nestedTriples: RDF.Quad[] };

/**
 * Transform a Triples syntax node into a list of triples
 * @param directives Known directives 
 * @param editorState The Code Mirror editor content
 * @param node The syntax node
 * @returns The list of RDF quads
 */
export function triples(
  directives: TurtleDirectives, editorState: EditorState, node: SyntaxNode
): RDF.Quad[] {
  const child = node.firstChild;
  if (child === null) return [];

  let r: TriplesReadResult<RDF.Quad_Subject>;

  if (child.type.name === 'Subject' || child.type.name === 'QtSubject') {
    r = subject(directives, editorState, child);
  } else if (child.type.name === 'BlankNodePropertyList') {
    r = blankNodePropertyList(directives, editorState, child);
  } else {
    // Unknown child type (probably error type)
    return [];
  }

  if (r === null) return [];

  const pol = child.nextSibling;
  if (pol === null) return r.nestedTriples;

  const quadsFromPOL = predicateObjectList(directives, editorState, r.readValue, child);

  r.nestedTriples.push(...quadsFromPOL);

  return r.nestedTriples;
}

/**
 * Transform a Code Mirror subject node into the corresponding term and a list
 * of triples to add to the dataset
 * @param directives The directives
 * @param editorState The Code Mirror editor content
 * @param currentNode The syntax node where the subject is
 * @returns The subject term and the list of RDF triples contained by it
 */
export function subject(
  directives: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.Quad_Subject> {
  return object(directives, editorState, currentNode) as TriplesReadResult<RDF.Quad_Subject>;
}

/**
 * Transform a blank node property list into the corresponding term and triples
 * @param directives The Turtle directives
 * @param editorState The Code Mirror editor content
 * @param currentNode The syntax node of the BlankPropertyList
 * @returns A term for the blank node and the list of contained RDF triples
 */
export function blankNodePropertyList(
  directives: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.BlankNode> {
  const uniqueName = "_shacledturtle_bn-" + currentNode.from + "~" + currentNode.to
  const self = DataFactory.blankNode(uniqueName);

  const polNode = currentNode.firstChild;
  if (polNode === null) {
    return { readValue: self, nestedTriples: [] };
  }

  const quads = predicateObjectList(directives, editorState, self, polNode);
  return { readValue: self, nestedTriples: quads };
}

/**
 * Transform a text quoted triple into an RDF/JS triple
 * @param directives The Turtle directives
 * @param editorState The Code Mirror editor content
 * @param currentNode The syntax node of the QtTriple
 * @returns The quoted triple
 */
function quotedTriple(
  directives: TurtleDirectives, editorState: EditorState,
  node: SyntaxNode
): null | { readValue: RDF.Quad, nestedTriples: [] } {
  const r = triples(directives, editorState, node);
  if (r.length !== 1) {
    if (r.length > 1) {
      console.error("More than one result for Subject QtTriple");
    }
    return null;
  }

  return { readValue: r[0], nestedTriples: [] };
}

/**
 * Return the object that corresponds to the (nested) rdf list located at the
 * given objectNode position.
 * @param objectNode The object node
 * @returns A blank node
 */
export function getCollectionElementNode(objectNode: SyntaxNode): RDF.BlankNode {
  const isUnexpectedStructure = objectNode.type.name !== "Object"
    || objectNode.parent === null || objectNode.parent.type.name !== "Collection";
  
  if (isUnexpectedStructure) {
    console.error(
      "getCollectionElementNode: invalid usage ; parameter is a"
       + objectNode.type.name + " with " + objectNode.parent?.type.name
       + " as a parent but it should be an Object in a Collection" 
    );
  }

  const positionalName = "_shacledturtle_col-" + objectNode.from + "~" + objectNode.to;
  return DataFactory.blankNode(positionalName);
}

/**
 * Transform a text collection into an RDF/JS triple and the triples that
 * describe the collection
 * @param directives The Turtle directives
 * @param editorState The Code Mirror editor content
 * @param currentNode The syntax node of the collection
 * @returns The node that corresponds to the collection and the list of
 * triples that describes the collection.
 */
function collection(
  directives: TurtleDirectives, editorState: EditorState,
  currentNode: SyntaxNode
): TriplesReadResult<RDF.NamedNode | RDF.BlankNode> {
  // Read objects
  const objects: { syntaxNode: SyntaxNode, value: RDF.Quad_Object }[] = [];
  let quads: RDF.Quad[] = [];

  let child = currentNode.firstChild;
  while (child !== null) {
    const r = object(directives, editorState, child);
    if (r === null) break;

    objects.push({ syntaxNode: child, value: r.readValue });
    quads.push(...r.nestedTriples);

    child = child.nextSibling;
  }

  let head: RDF.NamedNode | RDF.BlankNode = ns.rdf.nil;

  for (let i = 0; i != objects.length; ++i) {
    let reverseI = objects.length - i - 1;
    const { syntaxNode, value } = objects[reverseI];
    const newHead = getCollectionElementNode(syntaxNode)

    quads.push(
      $quad(newHead, ns.rdf.first, value),
      $quad(newHead, ns.rdf.rest, head)
    );

    head = newHead;
  }

  // Return
  return { readValue: head, nestedTriples: quads };
}

/**
 * Transform a predicate object list into a list of triples
 * @param directives The Turtle directives
 * @param editorState The Code Mirror editor content
 * @param subject The RDF/JS term for the subject
 * @param node The syntax node of the collection
 * @returns The node that corresponds to the collection and the list of
 * triples that describes the collection.
 */
function predicateObjectList(
  directives: TurtleDirectives, editorState: EditorState,
  subject: RDF.Quad_Subject, node: SyntaxNode    
): RDF.Quad[] {
  let production: RDF.Quad[] = [];

  let currentVerb: RDF.Quad_Predicate | null = null;
  let currentObject: RDF.Quad_Object | null = null;

  let focus: SyntaxNode | null = node;
  for (; focus !== null; focus = focus.nextSibling) {
    if (focus.type.name === "Verb") {
      currentObject = null;

      const r = verb(directives, editorState, focus);
      if (r === null) {
        currentVerb = null;
      } else {
        currentVerb = r.readValue;
        production.push(...r.nestedTriples);
      }
    } else if (focus.type.name === "Object") {
      const r = object(directives, editorState, focus);
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
      production.push(...annotation(directives, editorState, focus, quad));
    } else {
      continue;
    }
  }

  return production;
}

/**
 * Transform a Code Mirror verb node into the corresponding term and a list
 * of triples to add to the dataset
 * @param directives The directives
 * @param editorState The Code Mirror editor content
 * @param currentNode The syntax node where the verb is
 * @returns The verb term and the list of RDF triples contained by it
 */
export function verb(
  directives: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.NamedNode> {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);
  if (token === "a") {
    return { readValue: ns.rdf.type, nestedTriples: [] };
  }

  // predicate -> iri
  const child = currentNode.firstChild;
  if (child === null) return null;

  if (child.type.name === "IRIREF") {
    return iriref(directives, editorState, child);
  } else if (child.type.name === "PrefixedName") {
    return prefixedName(directives, editorState, child);
  } else {
    return null;
  }
}

/**
 * Transform a Code Mirror object node into the corresponding term and a list
 * of triples to add to the dataset
 * @param directives The directives
 * @param editorState The Code Mirror editor content
 * @param currentNode The syntax node where the object is
 * @returns The object term and the list of RDF triples contained by it
 */
export function object(
  directives: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.Quad_Object> {
  const inner = currentNode.firstChild;
  if (inner === null) return null;

  switch (inner.type.name) {
    case "IRIREF":
      return iriref(directives, editorState, inner);
    case "PrefixedName":
      return prefixedName(directives, editorState, inner);
    case "BlankNode":
      return blankNode(editorState, inner);
    case "BlankNodePropertyList":
      return blankNodePropertyList(directives, editorState, inner);
    case "Anon":
      return anon(inner);
    case "Collection":
      return collection(directives, editorState, inner);
    case "QuotedTriple":
      return quotedTriple(directives, editorState, inner);
    case 'RDFLiteral':
      return rdfLiteral(directives, editorState, inner);
    case 'NumericLiteral':
      return numericLiteral(editorState, inner);
    case 'BooleanLiteral':
      return booleanLiteral(editorState, inner);
    default:
      return null;
  }
}

/**
 * Transform a Code Mirror annotation node into the list of triples to add
 * to the dataset
 * @param directives The directives
 * @param editorState The Code Mirror editor content
 * @param currentNode The syntax node where the object is
 * @param subject The quad that is annotated
 * @returns The object term and the list of RDF triples contained by it
 */
function annotation(
  directives: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode, subject: RDF.Quad
): RDF.Quad[] {
  const child = currentNode.firstChild;
  if (child === null) return [];
  return predicateObjectList(directives, editorState, subject, child);
}

/** Transforms an IRIREF node into an RDF/JS term */
function iriref(
  known: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
): TriplesReadResult<RDF.NamedNode> {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);
  const url = token.slice(1, token.length - 1);
  
  if (known.base === null || isAbsolute(url)) {
    return { readValue: DataFactory.namedNode(url), nestedTriples: [] }
  } else {
    return { readValue: known.base(url), nestedTriples: [] }
  }
}

function isAbsolute(url: string): boolean {
  return url.match("^[a-zA-Z][a-zA-Z0-9+-.]*:") !== null;
}

/** Transforms a PrefixedName node into an RDF/JS term */
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


/**
 * Assuming that node points to a PrefixedName, gives the corresponding term.
 * If the prefix is in the list of directives, returns a named node.
 * If the prefix is not in the list of directives, returns a variable.
 */
function prefixedNameSyntaxNodeToTerm(
  editorState: EditorState,
  directives: TurtleDirectives,
  node: SyntaxNode
): RDF.NamedNode | RDF.Variable | null {
  const pnPrefixNode = node.getChild('PN_PREFIX');
  const pnLocalNode = node.getChild('PN_LOCAL');

  const prefix = pnPrefixNode === null ? "" : editorState.sliceDoc(pnPrefixNode.from, pnPrefixNode.to);
  if (pnLocalNode === null) return null;

  const localNodeText = editorState.sliceDoc(pnLocalNode.from, pnLocalNode.to);
  
  const builder = directives.prefixes[prefix];
  if (builder === undefined) return DataFactory.variable(prefix + ":" + localNodeText);
  return builder[localNodeText];
}

/** Transforms a BlankNode node into an RDF/JS term */
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

/** Transforms an Anonymous node into an RDF/JS term */
function anon(currentNode: SyntaxNode): TriplesReadResult<RDF.BlankNode> {
  const uniqueName = "_shacledturtle_anon-" + currentNode.from + "~" + currentNode.to
  return { readValue: DataFactory.blankNode(uniqueName), nestedTriples: [] };
}

/** Transforms an RDFLiteral node into an RDF/JS term */
function rdfLiteral(
  directives: TurtleDirectives, editorState: EditorState, currentNode: SyntaxNode
) {
  const literalValueSyntaxNode = currentNode.firstChild;
  if (literalValueSyntaxNode === null) return null;
  const literalValuePart = editorState.sliceDoc(literalValueSyntaxNode.from + 1, literalValueSyntaxNode.to - 1);

  const followedBy = literalValueSyntaxNode.nextSibling;

  if (followedBy === null) {
    return wrapLiteral(DataFactory.literal(literalValuePart));
  }

  if (followedBy.type.name === "Langtag") {
    const langtag = editorState.sliceDoc(followedBy.from + 1, followedBy.to);
    return wrapLiteral(DataFactory.literal(literalValuePart, langtag));
  } else {
    let datatype: RDF.NamedNode | undefined = undefined;

    if (followedBy.type.name === "IRIREF") {
      datatype = iriref(directives, editorState, followedBy)?.readValue;
    } else if (followedBy.type.name === "PrefixedName") {
      datatype = prefixedName(directives, editorState, followedBy)?.readValue;
    }

    if (datatype === undefined) return null;

    return wrapLiteral(DataFactory.literal(literalValuePart, datatype));
  }
}

/** Transforms a NumericLiteral node into an RDF/JS term */
function numericLiteral(editorState: EditorState, currentNode: SyntaxNode) {
  const token = editorState.sliceDoc(currentNode.from, currentNode.to);

  try {
    const value = parseInt(token);
    const literal = DataFactory.literal(value);
    return wrapLiteral(literal);
  } catch (_) {
    return null;
  }
}

/** Transforms a BooleanLiteral node into an RDF/JS term */
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
