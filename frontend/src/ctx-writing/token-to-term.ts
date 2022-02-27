import { EditorState } from '@codemirror/state';
import { SyntaxNode } from '@lezer/common';
import * as RDF from '@rdfjs/types';
import { DataFactory } from "n3";
import { TurtleDirectives } from './autocompletion-solving';

/**
 * Assuming that node points to a PrefixedName, gives the corresponding term.
 * If the prefix is in the list of directives, returns a named node.
 * If the prefix is not in the list of directives, returns a variable.
 */
export function prefixedNameSyntaxNodeToTerm(
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
