import { parser } from "./syntax.grammar"
import { LRLanguage, LanguageSupport } from "@codemirror/language"
import { styleTags, tags as t } from "@codemirror/highlight"
// import { CompletionContext, CompletionResult } from "@codemirror/autocomplete"


// Inspired from https://github.com/codemirror/CodeMirror/blob/bd1b7d2976d768ae4e3b8cf209ec59ad73c0305a/mode/turtle/turtle.js
const d = {
  "@prefix": t.meta,
  "@base": t.meta,
  "a": t.meta,
  "<...>": t.atom,
  "'' ... '' or \"...\#": t.literal,
  ":": t.operator,
  "until:": t.variableName, // variable-3
};


export const TurtleLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      styleTags({
        IRIREF: t.atom,
        LineComment: t.lineComment,
        '_:': t.operator,
        ':': t.operator,
        PN_PREFIX: t.namespace,
        'a': t.meta,
        '@prefix': t.meta,
        'BASE': t.meta,
        "PREFIX": t.meta,
        "base": t.meta,
        "prefix": t.meta,
        '@base': t.meta,
        'BlankNodeLabel': t.variableName,
        'NumericLiteral': t.unit,
        'BooleanLiteral': t.unit
      })
    ]
  }),
  languageData: {
    commentTokens: {line: "#"}
  },
})

//function autocomplete(context: CompletionContext): CompletionResult | null {
//  return null;
//}
//
//export const turtleCompletion = TurtleLanguage.data.of({
//  autocomplete
//})

export function turtle() {
  return new LanguageSupport(TurtleLanguage, []);
}
