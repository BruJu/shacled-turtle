import assert from "assert";
import MetaDataState from "../src/ontology/MetaDataState";
import Ontology from "../src/ontology/OntologyBuilder";
import { loadDataset } from "./utility";
import * as n3 from "n3";
import { ns, $quad } from "../src/PRECNamespace";
import * as RDF from "@rdfjs/types";

describe("Ontology", () => {
  describe("Basic RDFS ontology", () => {
    const parentOntology = loadDataset(`
      ex:parent rdfs:domain ex:Child .
      ex:parent rdfs:range ex:Parent .
    `);

    const ontology = Ontology.make(parentOntology);

    it('should be able to build the ontologty', () => {
      assert.ok(ontology !== null && ontology !== undefined);
    });

    const meta = new MetaDataState(ontology);

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

