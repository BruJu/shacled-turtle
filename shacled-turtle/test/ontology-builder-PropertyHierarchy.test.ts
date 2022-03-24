import PropertyHierarchy from "../src/ontology/builder/PropertyHierarchy";
import * as RDF from "@rdfjs/types";
import * as n3 from "n3";
import { assertSame, ns, rdfTermToString } from "./utility";
import TermSet from "@rdfjs/term-set";
import { $quad } from "../src/namespaces";

describe('PropertyHierarchy', () => {
  testPH(
    'empty',
    [],
    [
      { k: ns.ex.a, vs: [ns.ex.a] }
    ]
  );

  testPH(
    'idempotency',
    [$quad(ns.ex.a, ns.rdfs.subPropertyOf, ns.ex.a)],
    [
      { k: ns.ex.a, vs: [ns.ex.a] }
    ]
  );

  testPH(
    'Simple subPropertyOf',
    [$quad(ns.ex.a, ns.rdfs.subPropertyOf, ns.ex.b)],
    [
      { k: ns.ex.a, vs: [ns.ex.a, ns.ex.b] },
      { k: ns.ex.b, vs: [ns.ex.b] }
    ]
  );

  testPH(
    'Transitive',
    [
      $quad(ns.ex.a, ns.rdfs.subPropertyOf, ns.ex.b),
      $quad(ns.ex.b, ns.rdfs.subPropertyOf, ns.ex.c),
    ],
    [
      { k: ns.ex.a, vs: [ns.ex.a, ns.ex.b, ns.ex.c] },
      { k: ns.ex.b, vs: [         ns.ex.b, ns.ex.c] },
      { k: ns.ex.c, vs: [                  ns.ex.c] }
    ]
  );
});

function testPH(
  name: string,
  triples: RDF.Quad[],
  expected: { k: RDF.Term, vs: RDF.Term[]}[]
) {
  it(name, () => {
    const ph = new PropertyHierarchy(new n3.Store(triples));

    for (const { k, vs } of expected) {
      const ps = new TermSet();
      ph.forAllSuperOf(k, p => ps.add(p));
      assertSame(ps, vs, rdfTermToString(k));
    }
  });
}
