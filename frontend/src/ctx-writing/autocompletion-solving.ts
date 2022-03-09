import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import namespace from '@rdfjs/namespace';
import { ns } from "../PRECNamespace";
import DebugInformation from "./DebugInformation";
import { tripleAutocompletion } from "./triples-autocompletion";


export type TurtleDirectives = {
  base: namespace.NamespaceBuilder<string> | null;
  prefixes: {[prefix: string]: namespace.NamespaceBuilder<string>}
};

enum TypeOfStatement { Triple, Directive }

export default function autocompletionSolve(context: CompletionContext)
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

  situation.injectInDocument(document);
  return retval;
}


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

function goToTypeOfStatement(cursor: TreeCursor): TypeOfStatement | null {
  const path = cursorGoesTo(cursor, ['Triples', 'Directive']);
  if (!path) return null;
  if (cursor.type.name === 'Triples') return TypeOfStatement.Triple;
  if (cursor.type.name === 'Directive') return TypeOfStatement.Directive;
  return null;
}

function cursorGoesTo(cursor: TreeCursor, alternatives: string[]): boolean {
  while (!alternatives.includes(cursor.type.name)) {
    const hasParent = cursor.parent();
    if (!hasParent) return false;
  }

  return true;
}

