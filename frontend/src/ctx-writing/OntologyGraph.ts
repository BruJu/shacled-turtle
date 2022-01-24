import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import { DataFactory, Quad, Store } from "n3";
import { SuggestableType } from "./SuggestionDatabase";
import { $defaultGraph, ns } from '../PRECNamespace';
import { termToString } from "rdf-string";

const $variable = DataFactory.variable;
const $any = $variable("-any");

function $quad(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term) {
  // To have a less annoying API
  return DataFactory.quad(
    subject as RDF.Quad_Subject,
    predicate as RDF.Quad_Predicate,
    object as RDF.Quad_Object
  );
}

function getWithDefault<Key, Value>(map: Map<Key, Value>, key: Key, initialValue: Value) {
  const v = map.get(key);
  if (v !== undefined) return v;

  map.set(key, initialValue);
  return initialValue;
}

export class Description {
  labels: TermSet<RDF.Literal> = new TermSet();
  comments: TermSet<RDF.Literal> = new TermSet();
  
  addLabelsAndComments(store: RDF.DatasetCore, subject: RDF.Quad_Subject) {
    Description.insertInto(store, subject, ns.rdfs.label, this.labels);
    Description.insertInto(store, subject, ns.rdfs.comment, this.comments);
    return this;
  }

  private static insertInto(
    store: RDF.DatasetCore,
    subject: RDF.Quad_Subject, predicate: RDF.Quad_Predicate,
    target: TermSet<RDF.Literal>
  ) {
    for (const quad of store.match(subject, predicate, null)) {
      const object = quad.object;
      if (object.termType === "Literal") {
        target.add(object);
      }
    }
  }
  
  addAll(description: Description) {
    description.labels.forEach(l => this.labels.add(l));
    description.comments.forEach(l => this.comments.add(l));
  }
}

export class OntologyGraph {
  _store: RDF.DatasetCore = new Store();
  _triples: Map<RDF.Quad, Description> = new TermMap();
  _existingTypes: Map<RDF.Term, Description> = new TermMap();
  _superClasses: Map<RDF.Term, Set<RDF.Term>> = new TermMap();
  _axiomaticTypes: Map<RDF.Term, Set<RDF.Term>> = new TermMap();

  static _ensureHas<Key>(term: Key, map: Map<Key, Description>) {
    let d = map.get(term);
    if (d !== undefined) return d;
    d = new Description();
    map.set(term, d);
    return d;
  }

  _ensureHasTriple(quad: RDF.Quad): Description {
    this._store.add(quad);
    return OntologyGraph._ensureHas(quad, this._triples);
  }

  _ensureHasType(type: RDF.Term): Description {
    return OntologyGraph._ensureHas(type, this._existingTypes);
  }

  addRdfsDomain(predicate: RDF.Term, domain: RDF.Term) {
    this._ensureHasTriple($quad(domain, predicate, $any));
    this._ensureHasType(domain);
  }

  addRdfsRange(predicate: RDF.Term, range: RDF.Term) {
    this._ensureHasTriple($quad($any, predicate, range));
    this._ensureHasType(range);
  }

  addRdfSubClassOf(subclass: RDF.Term, superclass: RDF.Term) {
    this._ensureHasType(subclass);
    this._ensureHasType(superclass);

    getWithDefault(this._superClasses, subclass, new TermSet())
    .add(superclass);
  }

  addType(type: RDF.Term): Description {
    return this._ensureHasType(type);
  }

  addLink(
    typeOfSource: RDF.Term | null,
    predicate: RDF.Term,
    typeOfDestination: RDF.Term | null
  ) {
    const subject = typeOfSource || $any;
    const object = typeOfSource || $any;

    if (typeOfSource) this._ensureHasType(typeOfSource);
    if (typeOfDestination) this._ensureHasType(typeOfDestination);

    return this._ensureHasTriple($quad(subject, predicate, object));
  }

  addAxiomaticTypes(nodes: TermSet<RDF.Term>, type: RDF.Variable) {
    for (const node of nodes) {
      getWithDefault(this._axiomaticTypes, node, new TermSet())
      .add(type);
    }
  }

  get types(): SuggestableType[] {
    let res: SuggestableType[] = [...this._existingTypes.entries()]
    .map(type => ({
      class: type[0],
      info: { labels: [], descriptions: [] }
    }))
    .filter(type => type.class.termType !== 'Variable');

//    console.log(res);
//
//    for (const { class: cl, info } of res) {
//      let d = new Description();
//      let explorer = new TermExplorer([cl]);
//
//      while (!explorer.isEmpty) {
//        const t = explorer.next();
//        console.log(t);
//        const ts_description = this._existingTypes.get(t);
//        if (ts_description) {
//          d.addAll(ts_description);
//        }
//
//        for (const superClass of this._superClasses.get(t) || []) {
//          // types.add(superClass);
//        }
//      }
//
//      info.labels!.push(...d.labels);
//      info.descriptions!.push(...d.comments);
//    }
//
//    console.log(this.types.map(t => termToString(t.class) + "~" + t.info));

    return res;
  }

  private getTypesOf(position: NodePosition): TermSet {
    const res = new TermSet();

    res.add($any);

    if (position.node !== undefined) {
      const types = this._axiomaticTypes.get(position.node);
      if (types !== undefined) {
        types.forEach(type => res.add(type));
      }
    }

    for (const type of position.types) {
      //if (this._existingTypes.has(type)) {
        res.add(type);
      //}
    }

    for (const predicate of position.subjectOf) {
      if (predicate.termType === 'Variable') continue;

      for (const quad of this._store.match(null, predicate, null, $defaultGraph)) {
        res.add(quad.subject);
      }
    }
    
    return res;
  }

  private getPaths(startingPositions: TermSet): TermMap<RDF.Term, Description> {
    let result = new TermMap<RDF.Term, Description>();

    let explorer = new TermExplorer(startingPositions);

    while (!explorer.isEmpty) {
      let term = explorer.next();

      for (const link of this._store.match(term, null, null, $defaultGraph)) {
        getWithDefault(result, link.predicate, new Description())
        .addAll(this._triples.get(link) || new Description());
      }

      for (const superType of this._superClasses.get(term) || []) {
        explorer.add(superType);
      }
    }

    return result;
  }

  getAllPredicatesFor(position: NodePosition) {
    const typesOfThisNode = this.getTypesOf(position);
    return this.getPaths(typesOfThisNode);
  }


}

export type NodePosition = {
  node: RDF.Term | undefined,
  types: TermSet,
  subjectOf: TermSet
};

class TermExplorer<TermType extends RDF.Term = RDF.Term> {
  explored: TermSet<TermType> = new TermSet();
  leftover: TermType[] = [];

  constructor(initialTerms: Iterable<TermType>) {
    for (const term of initialTerms) {
      this.add(term);
    }
  }

  get isEmpty() { return this.leftover.length === 0; }

  next(): TermType {
    let o = this.leftover[this.leftover.length - 1];
    this.leftover.splice(this.leftover.length - 1, 1);
    return o;
  }

  add(term: TermType): this {
    if (!this.explored.has(term)) {
      this.leftover.push(term);
      this.explored.add(term);
    }

    return this;
  }
}

