import { EditorState } from '@codemirror/state';
import { SyntaxNode } from '@lezer/common';
import * as RDF from '@rdfjs/types';
import { DataFactory } from "n3";
import { stringToTerm } from 'rdf-string';
import { ns } from "../PRECNamespace";
import { TurtleDirectives } from './autocompletion-solving';

export const AnonymousBlankNode: 1 = 1;

/**
 * Convert a Subject, a Verb or an Object in the Syntax Node into the
 * corresponding term.
 * @param editorState The editor state
 * @param directives The list of directives in the document
 * @param syntaxNode The syntax node of the subject / verb / object
 * @returns The term, or the information that it is an anonymous blank node,
 * or null if the detection failed.
 * 
 * @throws An error if syntaxNode is not a Subject / Verb / Object
 */
export function syntaxNodeToTerm(
  editorState: EditorState,
  directives: TurtleDirectives,
  syntaxNode: SyntaxNode
): RDF.Term | typeof AnonymousBlankNode | null {
  if (syntaxNode.name !== 'Subject'
    && syntaxNode.name !== 'Verb'
    && syntaxNode.name !== 'Object') {
    throw Error("syntaxNodeToTerm can only be used on Subject, Verb and Object, but was called on a " + syntaxNode.name);
  }

  const child = syntaxNode.firstChild;
  if (child === null) {
    if ("a" === editorState.sliceDoc(syntaxNode.from, syntaxNode.to)) {
      return ns.rdf.type;
    }

    return null;
  }
  
  if (child.name === 'Anon') return AnonymousBlankNode;
  if (child.name === 'BlankNodePropertyList') return AnonymousBlankNode;

  if (child.name === 'PrefixedName') {
    return prefixedNameSyntaxNodeToTerm(editorState, directives, child);
  } else {
    const rawText = editorState.sliceDoc(syntaxNode.from, syntaxNode.to);
    return tokenToTerm(rawText);
  }
}

/**
 * Converts the given token into a term. It should not be an RDF-star term
 * @param token The token
 * @returns The term, or null if no translation was found
 */
function tokenToTerm(token: string): RDF.Term | null {
  if (token === "a") {
    return ns.rdf.type;
  }

  if (token.startsWith("<") && token.endsWith(">")) {
    return stringToTerm(token.substring(1, token.length - 1));
  } else if (token.startsWith("_:")) {
    return DataFactory.blankNode(token.slice(2));
  } else {
    return null;
  }
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
