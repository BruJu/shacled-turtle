import { turtle } from "@bruju/lang-turtle";
import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import * as RDF from "@rdfjs/types";
import { TurtleDirectives } from "./autocompletion-solving";
import * as STParser from "./Parser";
import { readDirective } from "./triples-autocompletion";

export default function parseFullDocument(document: string): RDF.Quad[] {
  const state = EditorState.create({ doc: document, extensions: [turtle()] });

  const directives: TurtleDirectives = { base: null, prefixes: {} };

  const tree = syntaxTree(state);
  const root = tree.topNode;

  let child = root.firstChild;

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
