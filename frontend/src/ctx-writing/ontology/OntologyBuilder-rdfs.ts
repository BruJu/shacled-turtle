import * as RDF from '@rdfjs/types'
import OntologyBuilder from './OntologyBuilder';
import { $defaultGraph, ns } from '../../PRECNamespace';
import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import { addTermPairInTermMultiMap, getWithDefault } from '../../util';
import { DatasetCore } from '@rdfjs/types';

export default function addRDFS(ontoBuilder: OntologyBuilder, store: RDF.DatasetCore) {
  const propertyHierarchy = new PropertyHierarchy(store);

  const paths = new TermMap<RDF.Term, { domains: TermSet, ranges: TermSet }>();
  const initializer = () => ({ domains: new TermSet(), ranges: new TermSet() });

  for (const quad of store.match(null, ns.rdfs.domain, null)) {
    propertyHierarchy.forEachTermAndItsSuperProperties(
      quad.subject,
      property => {
        ontoBuilder.rdfsDomain(property, quad.object);

        getWithDefault(paths, property, initializer)
        .domains.add(quad.object);
      }
    );

    ontoBuilder.type(quad.object).isSuggestible = true;
  }

  for (const quad of store.match(null, ns.rdfs.range, null)) {
    propertyHierarchy.forEachTermAndItsSuperProperties(
      quad.subject,
      property => {
        ontoBuilder.rdfsRange(property, quad.object);

        getWithDefault(paths, property, initializer)
        .ranges.add(quad.object);
      }
    );

    ontoBuilder.type(quad.object).isSuggestible = true;
  }

  for (const [property, mapping] of paths) {
    for (const domain of mapping.domains) {
      if (mapping.ranges.size === 0) {
        ontoBuilder.path(domain, property);
      } else {
        for (const range of mapping.ranges) {
          ontoBuilder.path(domain, property, range);
        }
      }
    }
  }

  for (const quad of store.match(null, ns.rdfs.subClassOf, null)) {
    ontoBuilder.subClassOf(quad.subject, quad.object);
  }

  for (const quad of store.match(null, ns.rdf.type, ns.rdfs.Class)) {
    ontoBuilder.type(quad.subject).isSuggestible = true;
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
