import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import rdfNamespace from '@rdfjs/namespace';
import { ns } from "./namespaces";
import DebugInformation from "./DebugInformation";
import { tripleAutocompletion } from "./triples-autocompletion";

/**
 * A structure that contains all known turtle directives
 */
export type TurtleDirectives = {
  /** Base URL */
  base: rdfNamespace.NamespaceBuilder<string> | null;
  /** All prefixes */
  prefixes: {[prefix: string]: rdfNamespace.NamespaceBuilder<string>}
};

enum TypeOfStatement { Triple, Directive }

/**
 * Creates an autocompletion extension function for CodeMirror 6 with
 * SHACLed Turtle engine
 * @param onDebugInfo Function to call when a debug information object is
 * created. Optional. Helps to understand the position where the cursor is.
 */
export default function autocompletionSolve(
  onDebugInfo?: (debug: DebugInformation) => void
) {
  function trueAutocompletionSolve(context: CompletionContext)
  : null | CompletionResult {
    const tree = syntaxTree(context.state);
    const theNode: SyntaxNode | null = tree.resolve(context.pos, -1);
    if (theNode === null) return null;

    let cursor = theNode.cursor;

    const typeOfStatement = goToTypeOfStatement(cursor);
    if (typeOfStatement === null) return null;

    const situation = new DebugInformation(theNode);

    let retval: CompletionResult | null = null;
    if (typeOfStatement === TypeOfStatement.Directive) {
      situation.autoCompletionType = 'directive';
      retval = directiveAutocompletion(context, cursor.node, theNode);
    } else if (typeOfStatement === TypeOfStatement.Triple) {
      situation.autoCompletionType = 'triples';
      retval = tripleAutocompletion(context, tree, theNode, situation);
    }

    if (onDebugInfo !== undefined) {
      onDebugInfo(situation);
    }

    return retval;
  }

  return trueAutocompletionSolve;
}

/**
 * Function called when autocompletion is called for a directive
 * @param context The Code Mirror context
 * @param directiveSyntaxNode The syntax node of the current directive
 * @param currentlyFilledNode The node where the cursor is
 * @returns The completion result
 */
function directiveAutocompletion(
  context: CompletionContext, directiveSyntaxNode: SyntaxNode,
  currentlyFilledNode: SyntaxNode
): CompletionResult | null {
  const firstChild = directiveSyntaxNode.firstChild;
  if (firstChild === null) return null;

  if (firstChild.name !== 'PrefixID' && firstChild.name !== 'SparqlPrefix') {
    return null;
  }

  const prefix = firstChild.getChild("PN_PREFIX");
  if (prefix === null) return null;

  const text = context.state.sliceDoc(prefix.from, prefix.to);

  const pair = Object.entries(ns).find(([prefix, _]) => prefix === text);
  if (pair === undefined) return null;


  const word = context.matchBefore(/[a-zA-Z"'0-9_+-/<>:\\]*/);
  if (word === null) return null;

  if (!cursorGoesTo(currentlyFilledNode.cursor, ["IRIREF"])) return null;

  return {
    from: word.from,
    filter: false,
    options: [
      { label: '<' + pair[1][''].value + '>' }
    ]
  };
}

///////////////////////////////////////////////////////////////////////////////

/**
 * Moves the cursor to the parent of type Triples or Directives
 */
function goToTypeOfStatement(cursor: TreeCursor): TypeOfStatement | null {
  const path = cursorGoesTo(cursor, ['Triples', 'Directive']);
  if (!path) return null;
  if (cursor.type.name === 'Triples') return TypeOfStatement.Triple;
  if (cursor.type.name === 'Directive') return TypeOfStatement.Directive;
  return null;
}

/**
 * Moves the cursor to the parent node of one of the given type
 * @param cursor The cursor
 * @param alternatives The list of possible types
 * @returns True if an alternative has been found, else false
 */
function cursorGoesTo(cursor: TreeCursor, alternatives: string[]): boolean {
  while (!alternatives.includes(cursor.type.name)) {
    const hasParent = cursor.parent();
    if (!hasParent) return false;
  }

  return true;
}

