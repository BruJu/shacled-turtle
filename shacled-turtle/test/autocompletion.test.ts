import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import Ontology from "../src/ontology";
import { MetaBaseInterface } from "../src/ontology/MetaDataInterface";
import MetaDataState from "../src/ontology/MetaDataState";
import assert from "assert";
import { termToString } from "rdf-string";
import { ns } from "./utility";
import * as fs from "fs";
import * as path from "path";
import * as n3 from "n3";

const $quad = n3.DataFactory.quad;
const $lit = n3.DataFactory.literal;


class GraphCache {
  readonly pathToGraph = new Map<string, RDF.DatasetCore>();
  readonly pathToOntology = new Map<string, Ontology>();

  constructor(folder: string) {
    const root = path.join(__dirname, folder);

    const parser = new n3.Parser();

    for (const file of fs.readdirSync(root)) {
      if (file.endsWith(".ttl")) {
        const content = fs.readFileSync(path.join(root, file), "utf8");
        this.pathToGraph.set(file, new n3.Store(parser.parse(content)));
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
      { addQuad: $quad(ns.ex.tintin, ns.rdf.type, ns.ex.snowy) },
      { on: ns.ex.snowy, expect: [] },



    ]
    
  )






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

function assertSame(output: TermSet, expected: RDF.Term[], prefix: string = "") {
  const ok = output.size === expected.length
    && expected.every(term => output.has(term));

  if (ok) {
    assert.ok(true);
  } else {
    const missingTerms = expected.filter(term => !output.has(term));
    const excedentTerm = [...output.values()].filter(
      term => expected.find(x => x.equals(term)) === undefined
    );

    assert.ok(false,
      prefix
      + "Has=[" + [...output.values()].map(rdfTermToString).join(", ") + "] "
      + "Missing=[" + missingTerms.map(rdfTermToString).join(", ") + "] "
      + "Excedent=[" + excedentTerm.map(rdfTermToString).join(", ") + "]"
    );
  }
}

function rdfTermToString(term: RDF.Term): string {
  if (term.termType !== "NamedNode") {
    return termToString(term);
  }

  for (const [rdfPrefix, generator] of Object.entries(ns)) {
    const urlPrefix = generator[''].value;
    if (term.value.startsWith(urlPrefix)) {
      return rdfPrefix + ":" + term.value.substring(urlPrefix.length);
    }
  }

  return termToString(term);
}
