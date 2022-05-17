import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import Schema from "../src/schema";
import { MetaBaseInterface } from "../src/schema/MetaDataInterface";
import MetaDataState from "../src/schema/MetaDataState";
import { assertSame, ns, rdfTermToString } from "./utility";
import * as fs from "fs";
import * as path from "path";
import * as n3 from "n3";
import parseFullDocument from "../src/FullParser";
import { TypesAndShapes } from "../src/schema/SubDB-Suggestion";

const $quad = n3.DataFactory.quad;
const $lit = n3.DataFactory.literal;


class GraphCache {
  readonly pathToGraph = new Map<string, RDF.DatasetCore>();
  readonly pathToSchema = new Map<string, Schema>();

  constructor(folder: string) {
    const root = path.join(__dirname, folder);

    for (const file of fs.readdirSync(root)) {
      if (file.endsWith(".ttl")) {
        const content = fs.readFileSync(path.join(root, file), "utf8");

        // With Shacled Turtle Parser
        this.pathToGraph.set(file, new n3.Store(parseFullDocument(content)));

        // With n3's Parser
        // this.pathToGraph.set(file, new n3.Store(new n3.Parser().parse(content)));
      }
    }
  }

  getGraph(path: string): RDF.DatasetCore {
    const x = this.pathToGraph.get(path);
    if (x === undefined) throw Error("Graph " + path + " is unknown");
    return new n3.Store([...x]);
  }

  getSchema(path: string): Schema {
    let schema = this.pathToSchema.get(path);
    if (schema === undefined) {
      schema = Schema.make(this.getGraph(path));
      this.pathToSchema.set(path, schema);
    }
    return schema;
  }
}


describe("Suggestion of predicates", () => {
  const graphs = new GraphCache("autocompletion-documents");

  function generateUnitTest(
    graphName: string,
    schemaName: string,
    operations: Operation[]
  ): void {
    it(graphName + " x " + schemaName, () => {
      const data = graphs.getGraph(graphName);
      const schema = graphs.getSchema(schemaName);
      const meta = computeMeta(data, schema);

      for (let i = 0; i != operations.length; ++i) {
        const op = operations[i];
        if ('addQuad' in op) {
          data.add(op.addQuad);
          schema.ruleset.onNewTriple(op.addQuad, data, meta);
        } else {
          const suggested = getSuggestedPredicates(meta, schema, op.on);
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
    'schema-domainIncludes.ttl',
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
    'paths-schema-6.ttl',

    [
      { on: ex.node06, expect: [ex.a] },
      { on: ex.target6_1, expect: [ex.b] },
      { on: ex.target6_2, expect: [] },
      { on: ex.target6_3, expect: [ex.ok] }
    ]
  );

  generateUnitTest(
    'paths-data.ttl',
    'paths-schema.ttl',

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
      { on: ex.target6_2, expect: [] },
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


  generateUnitTest(
    'empty.ttl',
    'inverse-schema.ttl',
    [
      { addQuad: $quad(ex.intermediate, ex.b, ex.start) },
      { addQuad: $quad(ex.finish, ex.a, ex.intermediate) },
      { on: ex.finish, expect: [ ex.ok ] }
    ]
  );

  generateUnitTest(
    'empty.ttl',
    'inverse-schema.ttl',
    [
      { on: ex.alternativeInverse, expect: [] },
      { addQuad: $quad(ex.alternativeInverseF, ex.b, ex.alternativeInverse) },
      { on: ex.alternativeInverseF, expect: [ex.ok] },

      { on: ex.inverseAlternative, expect: [] },
      { addQuad: $quad(ex.inverseAlternativeF, ex.b, ex.inverseAlternative) },
      { on: ex.inverseAlternativeF, expect: [ex.ok] },
    ]
  );

  generateUnitTest(
    "empty.ttl",
    "edge-case-01.ttl",
    [
      { addQuad: $quad(ex.start, ex.a, ex.instance) },
      { on: ex.instance, expect: [ ex.ok, ex.a ] }
    ]
  );
});

type Operation =
  { addQuad: RDF.Quad }
  |
  { on: RDF.Quad_Subject, expect: RDF.Quad_Predicate[] }
;




function computeMeta(dataGraph: RDF.DatasetCore, schema: Schema): MetaBaseInterface {
  const meta = new MetaDataState(schema);
  for (const quad of dataGraph) {
    meta.onNewTriple(quad, dataGraph);
  }
  return meta;
}

function getSuggestedPredicates(
  meta: MetaBaseInterface, schema: Schema,
  subject: RDF.Quad_Subject
): TermSet<RDF.Term> {
  return new TermSet(
    schema.suggestible.getAllPathsFor(
      TypesAndShapes.from(
        meta.types.getAll(subject),
        meta.shapes.getAll(subject)
      )
    ).map(suggestion => suggestion.term)
  );
}
