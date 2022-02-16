import assert from "assert";
import * as RDF from "@rdfjs/types";
import { $quad, ns } from "../src/PRECNamespace";
import { buildAndRunOntology, loadDataset } from "./utility";
import { termToString } from "rdf-string";
import { MetaBaseInterface } from "../src/ontology/Ruleset";

describe("Ontology - Path Decomposer", () => {
  describe("Per equivalence class", () => {
    function oneTest(
      testName: string,
      dataGraphStr: string,
      ontologyGraphStr: string,
      equivalenceClasses: Array<Array<RDF.Term>>
    ) {
      function buildKey(base: MetaBaseInterface, term: RDF.Term): string {
        const types = base.types.getAll(term);
        const shapes = base.shapes.getAll(term);

        return [
          ...[...types].map(type => "t" + termToString(type)),
          ...[...shapes].map(shape => "s" + termToString(shape))
        ].sort().join("~");
      }

      it(testName, () => {
        const metaData = run(dataGraphStr, ontologyGraphStr);

        let alreadyUsedKeys = new Map<string, RDF.Term>();
        
        for (const equivalenceClass of equivalenceClasses) {
          if (equivalenceClass.length === 0) {
            assert.ok(false, "One of the equivalence classes is empty");
          }

          const first = equivalenceClass[0];
          const key = buildKey(metaData, first);
          
          const commonWith = alreadyUsedKeys.get(key);
          if (commonWith !== undefined) {
            assert.ok(false,
              `${termToString(first)} and ${termToString(commonWith)} `
              + "shares the same class"
            );
          }

          for (let i = 1; i != equivalenceClass.length; ++i) {
            const elem = equivalenceClass[i];
            const elemKey = buildKey(metaData, elem);

            assert.ok(key === elemKey,
              key === elemKey ? ""
                : `${termToString(first)} and ${termToString(elem)} `
                  + "should share the same key"
            );
          }

          alreadyUsedKeys.set(key, first);
        }

        assert.ok(true);
      });
    }

    oneTest("empty", "", "", []);

    oneTest(
      "One hard coded class",
      "ex:toto rdf:type ex:Person .",
      "",
      [[ns.ex.toto]]
    );

    oneTest(
      "One inferred class",
      "ex:toto ex:name 'toto' . ",
      "ex:name rdfs:domain ex:Person . ",
      [[ns.ex.toto]]
    );

    oneTest(
      "A shape",
      "ex:toto rdf:type ex:Person . ex:alice rdf:type ex:Person . ",
      "ex:personShape sh:targetClass ex:Person . ",
      [[ns.ex.toto, ns.ex.alice], [ns.ex.Person]]
    );

    oneTest(
      "A shape with two differents way to reach it",
      "ex:one ex:name1 'one' . ex:two ex:name2 'two' . ",
      "ex:Named sh:targetSubjectsOf ex:name1, ex:name2 . ",
      [[ns.ex.one, ns.ex.two]]
    );
  });

  describe("Check if reached", () => {
    function testHasShape(
      metaData: MetaBaseInterface, term: RDF.Term,
      mustHave: boolean = true, destination: RDF.Term = ns.ex.destination
    ) {
      const r = metaData.shapes.getAll(term).has(destination);
      assert.ok(
        r === mustHave,
        r === mustHave ? "" :
        (
          `${termToString(term)} should`
          + ( mustHave ? "" : " not")
          + " have the "
          + (destination.equals(ns.ex.destination) ? "destination shape" : "shape " + termToString(destination))
        )
          + " ; Shapes= " + [...metaData.shapes.getAll(term)].map(termToString).join(", ")
      );
    }

    function makeShape(path: string) {
      return `
        ex:source sh:targetClass ex:StartingPoint ;
          sh:property _:theProperty .
        _:theProperty sh:node ex:destination .
        _:theProperty sh:path ${path} .
      `;
    }

    it("Predicate Path", () => {
      const shape = makeShape("ex:predicate");

      const data = `
        ex:Alice a ex:StartingPoint ;
          ex:predicate ex:AliceTarget1 ;
          ex:bad ex:AliceTarget2 .
        
        ex:Bob ex:predicate ex:BobTarget .

        ex:Charlie a ex:StartingPoint ;
          ex:badly ex:CharlieTarget .
      `;

      const meta = run(data, shape);
//      meta.onNewTriple($quad(ns.ex.Alice, ns.ex.predicate, ns.ex.AliceTarget1), loadDataset(data))
//      console.log(meta.types.getAll(ns.ex.AliceTarget1))
//      console.log(meta.shapes.getAll(ns.ex.AliceTarget1))
      testHasShape(meta, ns.ex.Alice, true, ns.ex.source);
      testHasShape(meta, ns.ex.AliceTarget1, true);
      testHasShape(meta, ns.ex.AliceTarget2, false);
      testHasShape(meta, ns.ex.BobTarget, false);
      testHasShape(meta, ns.ex.CharlieTarget, false);
    });







  });

});

function run(dataStr: string, ontologyStr: string) {
  const dataGraph = loadDataset(dataStr);
  const ontologyGraph = loadDataset(ontologyStr);
  const { metaData } = buildAndRunOntology(dataGraph, ontologyGraph);
  return metaData;
}
