# Shacled Turtle 🐢

A [Code Mirror 6](https://codemirror.net/6/) Turtle language support that
provides autocompletion based on the content of a schema graph. Schemas can be
written by using either RDFS, SHACL or a mix of both (= your usual ontology
and validation RDF graphs).

## How to use

You can use this extension like any other Code Mirror 6 extension.

For example, by using parcel:

- Start a new project: `npm init`
- Install the dependencies: `npm install @codemirror/basic-setup @codemirror/state @codemirror/view shacled-turtle n3`
- Install parcel and n3 types `npm install --save-dev parcel @types/n3`

- Make a file named `index.ts` with the following content:
```typescript
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

// Build a CodeMirror editor with the Shacled Turtle extension
const editor = new EditorView({
  parent: document.getElementById("editorparent")!,
  state: EditorState.create({
    doc: prefixes + "\n\n\n\n\n",
    extensions: [basicSetup, shacledTurtle()]
  })
});

// Write the corresponding schema with SHACL
const shapeGraph = prefixes + `
  ex:PersonShape a sh:NodeShape ;
    sh:targetClass s:Person ;
    sh:property [ sh:path s:name ] .
`;

// Tell the editor that the schema used to provide autocompletion is
// the schema graph described in variable shapeGraph.
changeSchema(editor.state, new n3.Parser().parse(shapeGraph));
```

- Make a file named `index.html` with the following content
```html
<html>
  <body>
    <h1>Shacled Turtle Basic example</h1>
    <div id="editorparent"></div>
    <script src="index.ts" type="module"></script>
  </body>
</html>
```

- Run `npx parcel ./index.html -p 8080`

- Open on your favorite broswer http://localhost:8080

On the code editor, type `ex:Alice r`, the editor suggests `rdf:type` then
`s:Person`.

After `ex:Alice rdf:type s:Person . `, write `ex:alice s` and the engine
will suggest `s:name` because it knows Alice is a person.


## License

Published under either the CeCCIL-B license or the MIT License by INSA Lyon / Julian Bruyat.
