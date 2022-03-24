import { basicSetup } from "@codemirror/basic-setup";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { shacledTurtle, changeSchema } from "shacled-turtle";
import * as n3 from "n3";

const prefixes = 
`@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix ex: <http://example.com/ns#> .
@prefix s: <http://schema.org/> .`;

const editor = new EditorView({
  parent: document.getElementById("editorparent")!,
  state: EditorState.create({
    doc: prefixes + "\n\n\n\n\n",
    extensions: [basicSetup, shacledTurtle()]
  })
});

const shapeGraph = prefixes + `
  ex:PersonShape a sh:NodeShape ;
    sh:targetClass s:Person ;
    sh:property [ sh:path s:name ] .
`;

changeSchema(editor.state, new n3.Parser().parse(shapeGraph));
