import { turtle } from "@bruju/lang-turtle";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { Tree } from "@lezer/common";
import * as RDF from "@rdfjs/types";
import { TurtleDirectives } from "./autocompletion-solving";
import * as STParser from "./Parser";
import { readDirective } from "./triples-autocompletion";

export default function parseFullDocument(document: string): RDF.Quad[] {
  const state = EditorState.create({ doc: document, extensions: [turtle()] });
  const tree = getSyntaxTree(state);

  const root = tree.topNode;

  let child = root.firstChild;

  const directives: TurtleDirectives = { base: null, prefixes: {} };

  let currentTriples: RDF.Quad[] = [];

  while (child !== null) {
    if (child.type.name === "Directive") {
      readDirective(directives, state, child);
    } else if (child.type.name === "Triples") {
      const triples = STParser.triples(directives, state, child);
      triples.forEach(triple => currentTriples.push(triple));
    } else {
      // unknown type
    }

    child = child.nextSibling;
  }

  return currentTriples;
}

function getSyntaxTree(state: EditorState): Tree {
  while (true) {
    const tree = ensureSyntaxTree(state, 5000);
    if (tree !== null) {
      return tree;
    }

    // Wait for another 5000 ms
  }
}
