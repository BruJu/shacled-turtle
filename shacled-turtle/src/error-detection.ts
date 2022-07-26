import { linter, Diagnostic } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

class RangedErrors {
  knownIntervals: { from: number, to: number }[] = [];

  addError(from: number, to: number) {
    // addError is called through a tree exploration. Therefore, it is in
    // practice impossible to have overlapping intervals such that one of
    // the interval is not included in the second one.
    for (const existing of this.knownIntervals) {
      if (existing.from <= from && existing.to >= to) return;

      if (from <= existing.from && to >= existing.to) {
        existing.from = from;
        existing.to = to;
        return;
      }
    }

    this.knownIntervals.push({ from, to });
  }
}

function lintExample(view: EditorView): readonly Diagnostic[] {
  const rangedErrors = new RangedErrors();

  syntaxTree(view.state).iterate({
    enter: (type, from, to) => {
      if (type.isError) {
        rangedErrors.addError(from, to);
      }
    },
  });

  return rangedErrors.knownIntervals
  .map(({ from, to }) => ({
    from, to,
    severity: "error",
    message: "There is a syntax error around here"
  }));
}

const lint = linter(view => lintExample(view));

export default lint;
