import * as RDF from '@rdfjs/types';
import { ns } from '../../namespaces';
import SchemaBuilder from './index';
import PropertyHierarchy from './PropertyHierarchy';

/**
 * Adds rules related to RDFS into the schema
 * @param builder The schema builder
 * @param store The schema raw dataset
 */
export default function addRDFS(builder: SchemaBuilder, store: RDF.DatasetCore) {
  const propertyHierarchy = new PropertyHierarchy(store);

  builder.rulesBuilder.rdfType();

  for (const quad of store.match(null, ns.rdfs.domain, null)) {
    propertyHierarchy.forAllSubOf(
      quad.subject,
      property => {
        builder.rulesBuilder.rdfsDomain(property, quad.object);
        builder.suggestibleBuilder.addTypingPredicate(
          property, SchemaBuilder.descriptionOf(store, property)
        );
      }
    );

    builder.suggestibleBuilder.addExistingType(
      quad.object, SchemaBuilder.descriptionOf(store, quad.object)
    );

    builder.suggestibleBuilder.addTypePath(
      quad.object, quad.subject as RDF.NamedNode, SchemaBuilder.descriptionOf(store, quad.subject)
    );
  }

  for (const quad of store.match(null, ns.rdfs.range, null)) {
    propertyHierarchy.forAllSubOf(
      quad.subject,
      property => builder.rulesBuilder.rdfsRange(property, quad.object)
    );

    builder.suggestibleBuilder.addExistingType(
      quad.object, SchemaBuilder.descriptionOf(store, quad.object)
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
      quad.subject, SchemaBuilder.descriptionOf(store, quad.subject)
    );
  }
}
