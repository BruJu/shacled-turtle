import * as RDF from "@rdfjs/types";
import assert from "assert";
import * as n3 from "n3";
import { $quad } from "../src/namespaces";
import Schema from "../src/schema";
import MetaBase from "../src/schema/MetaBase";
import { loadDataset, ns } from "./utility";

describe("Schema", () => {
  describe("Basic RDFS ontology", () => {
    const parentOntology = loadDataset(`
      ex:parent rdfs:domain ex:Child .
      ex:parent rdfs:range ex:Parent .
    `);

    const schema = Schema.make(parentOntology);

    it('should be able to build the ontologty', () => {
      assert.ok(schema !== null && schema !== undefined);
    });

    const meta = new MetaBase(schema);

    const data = new n3.Store();

    function addQuad(s: RDF.Quad_Subject, p: RDF.Quad_Predicate, o: RDF.Quad_Object) {
      const quad = $quad(s, p, o);
      data.add(quad);
      meta.onNewTriple(quad, data);
    }

    it('should do nothing when unrelated predicates are added', () => {
      assert.equal(meta.types.getAll(ns.ex.toto).size, 0);
      addQuad(ns.ex.toto, ns.ex.likes, ns.ex.sophie);
      assert.equal(meta.types.getAll(ns.ex.toto).size, 0);
    });

    it('ex:toto ex:parent ex:sophie -> ex:toto is a Child', () => {
      assert.equal(meta.types.getAll(ns.ex.toto).size, 0);

      addQuad(ns.ex.toto, ns.ex.parent, ns.ex.sophie);

      assert.equal(meta.types.getAll(ns.ex.toto).size, 1);
      assert.ok([...meta.types.getAll(ns.ex.toto)][0].equals(ns.ex.Child));
    });
  });
});
