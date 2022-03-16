import * as RDF from "@rdfjs/types";
import * as n3 from "n3";

/**
 * An RDF/JS dataset implementation splitted in two stores: one stable store
 * and one unstable store.
 * 
 * New triples are added to the unstable store. It is possible to clear in
 * one go the unstable store or transfer all unstable triples into the stable
 * store.
 */
export default class DoubleDataset implements RDF.DatasetCore {
  readonly stable: n3.Store = new n3.Store();
  readonly unstable: n3.Store = new n3.Store();
  
  get size(): number {
    return this.stable.size + this.unstable.size;
  }

  add(quad: RDF.Quad): this {
    if (this.stable.has(quad)) return this;
    this.unstable.add(quad);
    return this;
  }

  delete(quad: RDF.Quad): this {
    this.stable.delete(quad);
    this.unstable.delete(quad);
    return this;
  }

  has(quad: RDF.Quad): boolean {
    return this.stable.has(quad) || this.unstable.has(quad);
  }

  match(subject?: RDF.Term | null, predicate?: RDF.Term | null, object?: RDF.Term | null, graph?: RDF.Term | null): RDF.DatasetCore<RDF.Quad, RDF.Quad> {
    const stable = (this.stable as RDF.DatasetCore)
    .match(subject, predicate, object, graph);
    const unstable = (this.unstable as RDF.DatasetCore)
    .match(subject, predicate, object, graph);

    if (stable.size === 0) return unstable;
    if (unstable.size === 0) return stable;

    return new n3.Store([...stable, ...unstable]);
  }

  [Symbol.iterator](): Iterator<RDF.Quad, any, undefined> {
    return [
      ...this.stable,
      ...this.unstable
    ][Symbol.iterator]();
  }

  clearUnstable(): this {
    this.unstable.removeMatches();
    return this;
  }

  clearBoth(): this {
    this.stable.removeMatches();
    this.unstable.removeMatches();
    return this;
  }

  stabilize(): this {
    this.stable.addQuads([...this.unstable]);
    this.unstable.removeMatches();
    return this;
  }
}
