import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import Ontology from "../src/ontology";
import { MetaBaseInterface } from "../src/ontology/MetaDataInterface";
import MetaDataState from "../src/ontology/MetaDataState";
import { assertSame, ns, rdfTermToString } from "./utility";
import * as fs from "fs";
import * as path from "path";
import * as n3 from "n3";
import parseFullDocument from "../src/FullParser";

const $quad = n3.DataFactory.quad;
const $lit = n3.DataFactory.literal;


class GraphCache {
  readonly pathToGraph = new Map<string, RDF.DatasetCore>();
  readonly pathToOntology = new Map<string, Ontology>();

  constructor(folder: string) {
    const root = path.join(__dirname, folder);

    for (const file of fs.readdirSync(root)) {
      if (file.endsWith(".ttl")) {
        const content = fs.readFileSync(path.join(root, file), "utf8");
        this.pathToGraph.set(file, new n3.Store(parseFullDocument(content)));

        // this.pathToGraph.set(file, new n3.Store(new n3.Parser().parse(content)));
      }
    }
  }

  getGraph(path: string): RDF.DatasetCore {
    const x = this.pathToGraph.get(path);
    if (x === undefined) throw Error("Graph " + path + " is unknown");
    return new n3.Store([...x]);
  }

  getOntology(path: string): Ontology {
    let ontology = this.pathToOntology.get(path);
    if (ontology === undefined) {
      ontology = Ontology.make(this.getGraph(path));
      this.pathToOntology.set(path, ontology);
    }
    return ontology;
  }
}


describe("Suggestion of predicates", () => {
  const graphs = new GraphCache("autocompletion-documents");

  function generateUnitTest(
    graphName: string,
    ontologyName: string,
    operations: Operation[]
  ): void {
    it(graphName + " x " + ontologyName, () => {
      const data = graphs.getGraph(graphName);
      const ontology = graphs.getOntology(ontologyName);
      const meta = computeMeta(data, ontology);

      for (let i = 0; i != operations.length; ++i) {
        const op = operations[i];
        if ('addQuad' in op) {
          data.add(op.addQuad);
          ontology.ruleset.onNewTriple(op.addQuad, data, meta);
        } else {
          const suggested = getSuggestedPredicates(meta, ontology, op.on);
          assertSame(
            suggested, op.expect,
            `Step #${i + 1} ; ${rdfTermToString(op.on)} `
            + `(Types=${[...meta.types.getAll(op.on)].map(rdfTermToString).join(", ")} `
            + `Shapes=${[...meta.shapes.getAll(op.on)].map(rdfTermToString).join(", ")}) `
            + " ; Suggestions: "
          );
        }
      }
    });
  }

  generateUnitTest(
    'empty.ttl',
    'simple-domain.ttl',
    [
      // Alice is named
      { on: ns.ex.alice, expect: [ns.ex.firstname, ns.ex.color] },
      { addQuad: $quad(ns.ex.alice, ns.ex.firstname, $lit('Alice')) },
      { on: ns.ex.alice, expect: [ns.ex.firstname] },

      // Blue plane
      { on: ns.ex.blueplane, expect: [ns.ex.firstname, ns.ex.color] },
      //   flies - nothing changes
      { addQuad: $quad(ns.ex.blueplane, ns.ex.flies, ns.ex.alot) },
      { on: ns.ex.blueplane, expect: [ns.ex.firstname, ns.ex.color] },
      //   is blue - it's colored
      { addQuad: $quad(ns.ex.blueplane, ns.ex.color, $lit("blue")) },
      { on: ns.ex.blueplane, expect: [ns.ex.color] },
    ]
  );

  generateUnitTest(
    'empty.ttl',
    'onto-domainIncludes.ttl',
    [
      { on: ns.ex.tintin, expect: [] },
      { on: ns.ex.snowy, expect: [] },
      { addQuad: $quad(ns.ex.tintin, ns.rdf.type, ns.ex.Person) },
      { on: ns.ex.tintin, expect: [ns.ex.knows] },
      { addQuad: $quad(ns.ex.tintin, ns.ex.knows, ns.ex.snowy) },
      { on: ns.ex.snowy, expect: [] },
      { addQuad: $quad(ns.ex.snowy, ns.ex.knows, ns.ex.tintin) },
      { on: ns.ex.snowy, expect: [] },
    ]
  );

  generateUnitTest(
    'empty.ttl',
    'infer_from_range.ttl',
    [
      // RDFS
      { on: ns.ex.rdfsNode1, expect: [] },
      { on: ns.ex.rdfsNode2, expect: [] },
      { addQuad: $quad(ns.ex.rdfsNode1, ns.ex.rdfs1, ns.ex.rdfsNode2) },
      { on: ns.ex.rdfsNode1, expect: [] },
      { on: ns.ex.rdfsNode2, expect: [ns.ex.rdfs2] },
      // SHACL targetNode
      { on: ns.ex.node, expect: [ns.ex.shacl2] },
      // SHACL targetClass
      { on: ns.ex.classed, expect: [] },
      { addQuad: $quad(ns.ex.classed, ns.rdf.type, ns.ex.Shape) },
      { on: ns.ex.classed, expect: [ns.ex.shacl2] },
      // SHACL targetObjectsOf
      { on: ns.ex.objected, expect: [] },
      { addQuad: $quad(ns.ex.hello, ns.ex.shacl1, ns.ex.objected) },
      { on: ns.ex.objected, expect: [ns.ex.shacl2] }
    ]
  );

  generateUnitTest(
    'empty.ttl',
    'rdfs-test.ttl',
    [
      { addQuad: $quad(ns.ex.testSubClass, ns.rdf.type, ns.ex.SubClass) },
      { on: ns.ex.testSubClass, expect: [ns.ex.ok] },

      { addQuad: $quad(ns.ex.fatherSubject, ns.ex.father, ns.ex.fatherObject) },
      { on: ns.ex.fatherSubject, expect: [ns.ex.domainedOk, ns.ex.parent] },
      { on: ns.ex.fatherObject, expect: [ns.ex.rangedOk] }
    ]
  );


  const ex = ns.ex;

  generateUnitTest(
    'paths-data.ttl',
    'paths-ontology.ttl',

    [
      { on: ex.totally_not_here, expect: [] },

      { on: ex.node01, expect: [ex.a] },
      { on: ex.target1regular, expect: [ex.ok] },
      { on: ex.target1inverse, expect: [] },
      { on: ex.target1bad, expect: [] },

      { on: ex.node02, expect: [] },
      { on: ex.target2regular, expect: [] },
      { on: ex.target2inverse, expect: [ex.ok] },
      { on: ex.target2bad, expect: [] },

      { on: ex.node03, expect: [ex.a] },
      { on: ex.target3regular, expect: [ex.ok] },
      { on: ex.target3inverse, expect: [] },
      { on: ex.target3bad, expect: [] },

      { on: ex.node04, expect: [ex.ok] },
      { on: ex.target4, expect: [] },

      { on: ex.node05, expect: [ex.a] },
      { on: ex.target5, expect: [ex.ok] },

      { on: ex.node06, expect: [ex.a] },
      { on: ex.target6_1, expect: [ex.b] },
//      { on: ex.target6_2, expect: [] },
      { on: ex.target6_3, expect: [ex.ok] },

      { on: ex.node07, expect: [] },
      
      { on: ex.node08, expect: [ex.a] },
      { on: ex.target8, expect: [ex.ok] },

      { on: ex.node09, expect: [ex.a, ex.b, ex.c] },
      { on: ex.target9, expect: [ex.ok] },

      { on: ex.node10, expect: [ex.a, ex.ok] },
      { on: ex.target10_one, expect: [ex.a, ex.ok] },
      { on: ex.target10_mult, expect: [ex.a, ex.ok] },

      { on: ex.node11, expect: [ex.a] },
      { on: ex.target11_one, expect: [ex.a, ex.ok] },
      { on: ex.target11_mult, expect: [ex.a, ex.ok] },

      { on: ex.node12, expect: [ex.a, ex.ok] },
      { on: ex.target12_one, expect: [ex.ok] },
      { on: ex.target12_mult, expect: [] },
    ]
  );



});

type Operation =
  { addQuad: RDF.Quad }
  |
  { on: RDF.Quad_Subject, expect: RDF.Quad_Predicate[] }
;




function computeMeta(dataGraph: RDF.DatasetCore, ontology: Ontology): MetaBaseInterface {
  const meta = new MetaDataState(ontology);
  for (const quad of dataGraph) {
    meta.onNewTriple(quad, dataGraph);
  }
  return meta;
}

function getSuggestedPredicates(
  meta: MetaBaseInterface, ontology: Ontology,
  subject: RDF.Quad_Subject
): TermSet<RDF.Term> {
  return new TermSet(ontology.suggestible.getAllPathsFor(
    meta.types.getAll(subject),
    meta.shapes.getAll(subject)
  ).map(suggestion => suggestion.term));
}
