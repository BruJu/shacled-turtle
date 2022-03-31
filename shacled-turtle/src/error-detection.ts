import { linter, Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

function lintExample(view: EditorView): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  syntaxTree(view.state).iterate({
    enter: (type, from, to) => {
      if (type.isError) {
        diagnostics.push({
          from,
          to,
          severity: "error",
          message: "There is an error around here",
        });
      }
    },
  });

  return diagnostics;
}

const lint = linter(view => lintExample(view));

export default lint;
