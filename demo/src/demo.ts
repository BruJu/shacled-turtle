import ContextCodeEditor, { initialDocument } from "./ContextCodeEditor";
import { ViewUpdate, ViewPlugin, EditorView } from "@codemirror/view"
import { changeSchema, parseDocument } from "shacled-turtle";
import * as RDF from "@rdfjs/types";

const shaclWrapper = document.getElementById("editor_shacl")!;
const dataWrapper = document.getElementById("editor_data")!;

const shaclGraph = "https://gist.githubusercontent.com/BruJu/08d39fc77b6eeea8ecd5a632409940f6/raw/1515bb5c59516d68f10c0d06a7dcce67ffc818d1/shacl.shape.ttl";

const minHeightEditor = EditorView.theme({
  "&": {height: "400px", "max-height": "400px", width: "600px"},
  ".cm-scroller": {overflow: "auto"},
  ".cm-content, .cm-gutter": {"max-height": "400px"}
});


const theme = EditorView.theme({
  "&": { height: "600px" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-content, .cm-gutter": { minHeight: "600px" }
});

const dataEditor = new ContextCodeEditor(dataWrapper,
  [minHeightEditor],
  undefined,
initialDocument() +
`ex:Alice rdf:type ex:Person 
# If you start typing "; ex:", ex:name will be suggested

 .`
);

const initialShapeGraph = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://www.example.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .


# A Person
ex:PersonShape a sh:NodeShape ;
  sh:targetClass ex:Person ;
  # can have a name
  sh:property [
    sh:path ex:name ;
    sh:nodeKind sh:Literal
  ] .
  
`;

let currentShapeGraph: RDF.Quad[] = [];

function updateShapeGraph(turtleDocument: string) {
  currentShapeGraph = parseDocument(turtleDocument);
  changeSchema(dataEditor.view.state, currentShapeGraph);
}

updateShapeGraph(initialShapeGraph);

const onEditContextPlugin = ViewPlugin.fromClass(class {
  update(update: ViewUpdate) {
    if (update.docChanged) {
      const docContent = update.view.state.sliceDoc();
      updateShapeGraph(docContent);
    }
  }
});

const shaclEditor = new ContextCodeEditor(
  shaclWrapper,
  [onEditContextPlugin, minHeightEditor],
  undefined,
  initialShapeGraph
);

shaclEditor.changeSchema(shaclGraph,);

