import { Extension } from "@codemirror/state";
import { ShacledTurtleOptions } from "shacled-turtle";
import ContextCodeEditor from "./ContextCodeEditor";

export default function makeFlexibleTurtleEditor(
  editorRoot: HTMLElement,
  urlTextBox: HTMLInputElement,
  validationButton: HTMLButtonElement,
  defaultShape: string | null = null,
  extraExtensions: Extension[] = [],
  stOptions?: ShacledTurtleOptions
) {
  // Initialize values
  const editor = new ContextCodeEditor(editorRoot, extraExtensions, stOptions);

  // Load context
  if (defaultShape === null) {
    urlTextBox.value = "";
  } else {
    urlTextBox.value = defaultShape;
    editor.changeSchema(defaultShape);
  }

  // Add listeners
  urlTextBox.addEventListener('change', () => {
    urlTextBox.classList.remove("is-success");
    urlTextBox.classList.remove("is-danger");
  });

  validationButton.addEventListener('click', async () => { 
    if (validationButton.classList.contains("is-loading")) return;
    validationButton.classList.add("is-loading");
    validationButton.classList.remove("is-success");
    validationButton.classList.remove("is-danger");
  
    const res = await editor.changeSchema(urlTextBox.value);
    validationButton.classList.remove("is-loading");
  
    if (res) {
      urlTextBox.classList.add("is-success");
    } else {
      urlTextBox.classList.add("is-danger");
    }
  });
}
