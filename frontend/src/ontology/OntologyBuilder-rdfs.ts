import * as RDF from '@rdfjs/types'
import { OntologyBuilder } from './OntologyBuilder';
import { $defaultGraph, ns } from '../PRECNamespace';
import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import { addTermPairInTermMultiMap } from '../util';
import { DatasetCore } from '@rdfjs/types';

export default function addRDFS(builder: OntologyBuilder, store: RDF.DatasetCore) {
  const propertyHierarchy = new PropertyHierarchy(store);

  builder.rulesBuilder.rdfType();

  for (const quad of store.match(null, ns.rdfs.domain, null)) {
    propertyHierarchy.forEachTermAndItsSuperProperties(
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
  }

  for (const quad of store.match(null, ns.rdfs.range, null)) {
    propertyHierarchy.forEachTermAndItsSuperProperties(
      quad.subject,
      property => builder.rulesBuilder.rdfsRange(property, quad.object)
    );

    builder.suggestibleBuilder.addExistingType(
      quad.object, OntologyBuilder.descriptionOf(store, quad.object)
    );
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

class PropertyHierarchy {
  private readonly propertyToSuperProperties: TermMap<RDF.Term, TermSet>;

  constructor(store: DatasetCore) {
    this.propertyToSuperProperties = new TermMap();

    for (const quad of store.match(null, ns.rdfs.subPropertyOf, null, $defaultGraph)) {
      addTermPairInTermMultiMap(this.propertyToSuperProperties, quad.subject, quad.object);
    }
  
    PropertyHierarchy.transitiveClosure(this.propertyToSuperProperties);

    for (const [property, superProperty] of this.propertyToSuperProperties) {
      superProperty.add(property);
    }
  }

  static transitiveClosure(map: TermMap<RDF.Term, TermSet>) {
    const reverseMap = new TermMap<RDF.Term, TermSet>();
  
    for (const [subProperty, superProperties] of map) {
      superProperties.forEach(superProperty =>
        addTermPairInTermMultiMap(reverseMap, superProperty, subProperty)
      );
    }
  
    let stable = false;
    while (!stable) {
      stable = true;
      for (const [me, subProperties] of reverseMap) {
        const superProperties = map.get(me);
        if (superProperties === undefined) continue;
  
        for (const subProperty of subProperties) {
          const subSuper = map.get(subProperty)!;
  
          const before = subSuper.size;
  
          superProperties.forEach(superProperty => subSuper.add(superProperty));
  
          const after = subSuper.size;
          if (before !== after) stable = false;
        }
      }
    }
  }

  forEachTermAndItsSuperProperties(property: RDF.Term, consumer: (term: RDF.Term) => void) {
    const superProperties = this.propertyToSuperProperties.get(property);
    if (superProperties !== undefined) {
      superProperties.forEach(consumer);
    } else {
      consumer(property);
    }
  }
}
