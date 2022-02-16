import * as RDF from "@rdfjs/types";
import * as n3 from "n3";
import MetaDataState from "../src/ontology/MetaDataState";
import Ontology from "../src/ontology/OntologyBuilder";
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

export function buildAndRunOntology(
  data: RDF.DatasetCore,
  ontologyGraph: RDF.DatasetCore
) {
  const ontology = Ontology.make(ontologyGraph);
  const metaData = new MetaDataState(ontology);

  for (const triple of data) {
    metaData.onNewTriple(triple, data);
  }

  return { ontology, metaData };
}
