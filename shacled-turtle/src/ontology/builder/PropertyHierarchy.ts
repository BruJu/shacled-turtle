import * as RDF from "@rdfjs/types";
import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import { addTermPairInTermMultiMap } from "../../util";
import { ns, $defaultGraph } from '../../namespaces';

export default class PropertyHierarchy {
  private readonly propertyToSuperProperties: PropertyMapping = new PropertyMapping();
  private readonly propertyTOSubProperties: PropertyMapping = new PropertyMapping();

  constructor(store: RDF.DatasetCore) {
    for (const quad of store.match(null, ns.rdfs.subPropertyOf, null, $defaultGraph)) {
      this.propertyToSuperProperties.addPair(quad.subject, quad.object);
      this.propertyTOSubProperties.addPair(quad.object, quad.subject);
    }

    this.propertyTOSubProperties.computeClosure();
    this.propertyToSuperProperties.computeClosure();
  }

  forAllSuperOf(property: RDF.Term, consumer: (term: RDF.Term) => void) {
    this.propertyToSuperProperties.forEachAt(property, consumer);
  }

  forAllSubOf(property: RDF.Term, consumer: (term: RDF.Term) => void) {
    this.propertyTOSubProperties.forEachAt(property, consumer);
  }
}

class PropertyMapping {
  underlyingMap: TermMap<RDF.Term, TermSet> = new TermMap();

  addPair(key: RDF.Term, value: RDF.Term) {
    addTermPairInTermMultiMap(this.underlyingMap, key, value);
  }

  computeClosure() {
    const superToSub = new TermMap<RDF.Term, TermSet>();
  
    for (const [subProperty, superProperties] of this.underlyingMap) {
      superProperties.forEach(superProperty =>
        addTermPairInTermMultiMap(superToSub, superProperty, subProperty)
      );
    }
  
    let stable = false;
    while (!stable) {
      stable = true;
      for (const [me, subProperties] of superToSub) {
        const superProperties = this.underlyingMap.get(me);
        if (superProperties === undefined) continue;
  
        for (const subProperty of subProperties) {
          const subSuper = this.underlyingMap.get(subProperty)!;
  
          const before = subSuper.size;
  
          superProperties.forEach(superProperty => subSuper.add(superProperty));
  
          const after = subSuper.size;
          if (before !== after) stable = false;
        }
      }
    }
    
    for (const [property, superProperties] of this.underlyingMap) {
      superProperties.add(property);
    }
  }

  forEachAt(key: RDF.Term, consumer: (term: RDF.Term) => void) {
    const values = this.underlyingMap.get(key);
    if (values !== undefined) {
      values.forEach(consumer);
    } else {
      consumer(key);
    }
  }
}
