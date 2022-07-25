import * as RDF from "@rdfjs/types";
import * as n3 from "n3";
import MetaBase from "../src/schema/MetaBase";
import Schema from "../src/schema";
import * as baseNamespaces from "../src/namespaces";
import namespace from '@rdfjs/namespace';
import TermSet from "@rdfjs/term-set";
import { termToString } from "rdf-string";
import assert from 'assert';

const N3Factory = { factory: n3.DataFactory };

export function loadDataset(content: string): RDF.DatasetCore {
  let prefixesList: string[] = [];

  for (const [key, builder] of Object.entries(ns)) {
    prefixesList.push(`@prefix ${key}: <${builder[''].value}> . `);
  }

  const finalContent = prefixesList.join("") + "\n" + content;

  const parser = new n3.Parser();
  const quads = parser.parse(finalContent);
  return new n3.Store(quads);
}

export function buildAndRunSchema(
  dataGraph: RDF.DatasetCore,
  schemaGraph: RDF.DatasetCore
): { schema: Schema, metaData: MetaBase } {
  const schema = Schema.make(schemaGraph);
  const metaData = new MetaBase(schema);

  for (const triple of dataGraph) {
    metaData.onNewTriple(triple, dataGraph);
  }

  return { schema, metaData };
}

export const ns = {
  ...baseNamespaces.ns,
  ex: namespace("http://example.org/", N3Factory)
};

function unpackListOfTerms(list: TermSet | RDF.Term[]): [RDF.Term[], TermSet] {
  if (Array.isArray(list)) {
    return [list, new TermSet(list)];
  } else {
    return [[...list], list];
  }
}

export function assertSame(
  output: TermSet | RDF.Term[], expected: TermSet | RDF.Term[],
  prefix: string = ""
) {
  const [outputArray, outputSet] = unpackListOfTerms(output);
  const [expectedArray, expectedSet] = unpackListOfTerms(expected);

  const ok = outputSet.size === expectedSet.size
    && outputArray.every(term => expectedSet.has(term));

  if (ok) {
    assert.ok(true);
  } else {
    const missingTerms = expectedArray.filter(term => !outputSet.has(term));
    const excedentTerm = outputArray.filter(term => !expectedSet.has(term));

    assert.ok(false,
      prefix
      + "Has=[" + outputArray.map(rdfTermToString).join(", ") + "] "
      + "Missing=[" + missingTerms.map(rdfTermToString).join(", ") + "] "
      + "Excedent=[" + excedentTerm.map(rdfTermToString).join(", ") + "]"
    );
  }
}

export function rdfTermToString(term: RDF.Term): string {
  if (term.termType !== "NamedNode") {
    return termToString(term);
  }

  for (const [rdfPrefix, generator] of Object.entries(ns)) {
    const urlPrefix = generator[''].value;
    if (term.value.startsWith(urlPrefix)) {
      return rdfPrefix + ":" + term.value.substring(urlPrefix.length);
    }
  }

  return termToString(term);
}
