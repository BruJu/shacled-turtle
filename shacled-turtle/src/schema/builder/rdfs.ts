import * as RDF from '@rdfjs/types';
import { ns } from '../../namespaces';
import Description from '../Description';
import OntologyBuilder from './index';
import PropertyHierarchy from './PropertyHierarchy';

/**
 * Adds rules related to RDFS into the ontology
 * @param builder The ontology builder
 * @param store The ontology dataset
 */
export default function addRDFS(builder: OntologyBuilder, store: RDF.DatasetCore) {
  const propertyHierarchy = new PropertyHierarchy(store);

  builder.rulesBuilder.rdfType();

  for (const quad of store.match(null, ns.rdfs.domain, null)) {
    propertyHierarchy.forAllSubOf(
      quad.subject,
      property => {
        builder.rulesBuilder.rdfsDomain(property, quad.object);
        builder.suggestibleBuilder.addTypingPredicate(
          property, OntologyBuilder.descriptionOf(store, property)
        );
      }
    );

    builder.suggestibleBuilder.addExistingType(
      quad.object, OntologyBuilder.descriptionOf(store, quad.object)
    );

    builder.suggestibleBuilder.addTypePath(
      quad.object, quad.subject as RDF.NamedNode, new Description()
    );
  }

  for (const quad of store.match(null, ns.rdfs.range, null)) {
    propertyHierarchy.forAllSubOf(
      quad.subject,
      property => builder.rulesBuilder.rdfsRange(property, quad.object)
    );

    builder.suggestibleBuilder.addExistingType(
      quad.object, OntologyBuilder.descriptionOf(store, quad.object)
    );

    builder.suggestibleBuilder.addTypePathTarget(
      null, quad.subject as RDF.NamedNode, { type: quad.object }
    )
  }

  for (const quad of store.match(null, ns.rdfs.subClassOf, null)) {
    builder.rulesBuilder.rdfsSubClassOf(quad.subject, quad.object);
  }

  for (const quad of store.match(null, ns.rdf.type, ns.rdfs.Class)) {
    builder.suggestibleBuilder.addExistingType(
      quad.object, OntologyBuilder.descriptionOf(store, quad.subject)
    );
  }
}
