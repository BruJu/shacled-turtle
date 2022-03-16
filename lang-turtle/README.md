# CodeMirror 6 Turtle language

Basic Turtle language support for [CodeMirror 6](https://codemirror.net/6/).

This is based on the [language support example](https://codemirror.net/6/examples/lang-package/) and on the [W3C Turtle grammar specification](https://www.w3.org/TR/turtle/#sec-grammar).


## How to use

You can use it like any other Code Mirror 6 language support extension.

```typescript
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "@codemirror/basic-setup";
import { turtle } from "@bruju/lang-turtle";

new EditorView({
  parent: document.getElementById("editorParent") || document.body,
  state: EditorState.create({
    doc: "",
    extensions: [ basicSetup, turtle() ]
  })
});
```
