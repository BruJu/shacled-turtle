import * as RDF from "@rdfjs/types";
import * as n3 from "n3";
import { ns } from "../src/PRECNamespace";

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

