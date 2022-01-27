import * as RDF from '@rdfjs/types'
import OntologyBuilder from './OntologyBuilder';
import { ns } from '../../PRECNamespace';

export default function addRDFS(ontoBuilder: OntologyBuilder, store: RDF.DatasetCore) {
  for (const quad of store.match(null, ns.rdfs.domain, null)) {
    // TODO: consider subPropertyOf*/domain
    ontoBuilder.rdfsDomain(quad.subject, quad.object);
    ontoBuilder.type(quad.object).isSuggestible = true;
  }

  for (const quad of store.match(null, ns.rdfs.range, null)) {
    // TODO: consider subPropertyOf*/range
    ontoBuilder.rdfsRange(quad.subject, quad.object);
    ontoBuilder.type(quad.object).isSuggestible = true;
  }

  for (const quad of store.match(null, ns.rdfs.subClassOf, null)) {
    ontoBuilder.subClassOf(quad.subject, quad.object);
  }

  for (const quad of store.match(null, ns.rdf.type, ns.rdfs.Class)) {
    ontoBuilder.type(quad.subject).isSuggestible = true;
  }
}
