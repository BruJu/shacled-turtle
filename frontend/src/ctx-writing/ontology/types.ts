import * as RDF from "@rdfjs/types";
import { TermSet } from "@rdfjs/term-set";

export type NodePosition = {
  node: RDF.Term | undefined,
  types: TermSet,
  subjectOf: TermSet
};
