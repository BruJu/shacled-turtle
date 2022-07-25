import TermMap from "@rdfjs/term-map";
import * as RDF from "@rdfjs/types";
import { Queue } from "mnemonist";
import * as n3 from 'n3';
import { $defaultGraph } from "../namespaces";
import { getWithDefault } from "../util";
import { MetaBaseInterface } from "./MetaBaseInterface";

/** A rule in the supported inference system */
export type LogicRule = {
  /** Data triple pattern */
  dataBody: RDF.Quad | null;
  /** Meta triple pattern */
  metaBody: MetaInfo | null;
  /** Produced meta triple pattern */
  metaHead: MetaInfo;
};

/** A meta triple template pattern */
export type MetaInfo = {
  resource: RDF.Term;
  /**
   * - types = the value is of type target
   * - shapes = the value must conform to the shape target
   */
  kind: "types" | "shapes";

  shape: RDF.Term
};

export default class InferenceDatabase {
  /**
   * Predicate of the data triple to the list of logic rules to check.
   * Used as a starting point when a triple is added in the data.
   */
  private readonly dataPredicateToRules: TermMap<RDF.Term, LogicRule[]> = new TermMap();

  /**
   * Mapping from all types and shapes to the list of logic rules that mention
   * it in a meta condition.
   * 
   * Used to known what logic rules must be checked when a new type or shape
   * for a resource is found.
   */
  private readonly metaToRules: {
    types: TermMap<RDF.Term, LogicRule[]>,
    shapes: TermMap<RDF.Term, LogicRule[]>
  } = {
    types: new TermMap(),
    shapes: new TermMap()
  };

  /**
   * List of axioms
   * = attribution of types and shapes to resources that are always true
   */
  private readonly axioms: Array<LogicRule> = [];

  /**
   * Build an inference database = a structure that contains all rules for a
   * given schema to deduce the list of all (new) types and shapes of all
   * resources when a new triple is added
   * @param logicRules The list of logic rules
   */
  constructor(logicRules: LogicRule[]) {
    for (const logicRule of logicRules) {
      if (logicRule.dataBody === null && logicRule.metaBody === null) {
        this.axioms.push(logicRule);
      } else {
        if (logicRule.dataBody !== null) {
          getWithDefault(this.dataPredicateToRules, logicRule.dataBody.predicate, () => [])
          .push(logicRule);
        }

        if (logicRule.metaBody !== null) {
          const where = logicRule.metaBody.kind;

          getWithDefault(this.metaToRules[where], logicRule.metaBody.shape, () => [])
          .push(logicRule);
        }
      }
    }
  }

  /**
   * Adds the axiomatic types and shapes in a metabase storage
   * @param metaBase The meta base
   */
  addAxioms(metaBase: MetaBaseInterface): this {
    for (const axiom of this.axioms) {
      if (axiom.metaHead.kind === 'types') {
        metaBase.types.add(axiom.metaHead.resource, axiom.metaHead.shape);
      } else {
        metaBase.shapes.add(axiom.metaHead.resource, axiom.metaHead.shape);
      }
    }

    this.closeMeta(this.axioms.map(ax => ax.metaHead), new n3.Store(), metaBase);

    return this;
  }
  
  /**
   * Completes the metaBase the list of known types and shapes, according to
   * the current ruleset / schema, considering that newTriple has just been
   * added.
   * 
   * This function triggers all rules that can use newTriple as a starting
   * point, and trigger subsequent inferences.
   * @param newTriple The added triple
   * @param database All known triples, including newTriple
   * @param metaBase The metadata storage
   */
  onNewTriple(newTriple: RDF.Quad, database: RDF.DatasetCore, metaBase: MetaBaseInterface): this {
    const inferred = this.addTriple(newTriple, metaBase);
    if (inferred === null) return this;

    this.closeMeta(inferred, database, metaBase);
    return this;
  }

  /**
   * Infers new meta triples into metaBase related to the addition of
   * newTriples.
   * Returns the list of inffered meta triples
   */
  private addTriple(newTriple: RDF.Quad, metaBase: MetaBaseInterface): Array<MetaInfo> | null {
    // Find all rules that can use newTriple as a premice
    const relevantRules = this.dataPredicateToRules.get(newTriple.predicate);
    if (relevantRules === undefined) return null;
    if (relevantRules.length === 0) return null;

    /**
     * newTriple = a iri b
     * dataBody = ?u iri ?v
     * target = ?x
     * 
     * If ?x = ?u, returns a ; else ?x = ?v, returns b
     */
    function extractFromData(dataBody: RDF.Quad, target: RDF.Term) {
      if (target.equals(dataBody.subject)) {
        return newTriple.subject;
      } else {
        return newTriple.object;
      }
    }

    /** List of added meta information */
    let inferredMeta: Array<MetaInfo> = [];

    for (const tripleBasedRule of relevantRules) {
      if (tripleBasedRule.metaBody === null) {
        // No meta requirement, ok
      } else {
        const metaBody = tripleBasedRule.metaBody;
        const resourceToCheck = extractFromData(tripleBasedRule.dataBody!, metaBody.resource);
        const classifiedAs = metaBase[metaBody.kind].getAll(resourceToCheck);

        if (classifiedAs.has(metaBody.shape)) {
          // Has the type or shape required by the meta rule, ok
        } else {
          // Can not match the meta part, bad
          continue;
        }
      }
      
      const n = buildConcreteHead(tripleBasedRule, newTriple, null);
      if (addInMeta(metaBase, n)) {
        inferredMeta.push(n);
      }
    }

    return inferredMeta;
  }

  /**
   * Infers new meta information from newly added meta information.
   * @param inferred List of new meta information
   * @param database The data dataset
   * @param metaBase The meta dataset
   */
  private closeMeta(inferred: Array<MetaInfo>, database: RDF.DatasetCore, metaBase: MetaBaseInterface) {
    const newMetaInformations = Queue.from(inferred);

    while (true) {
      const inferred1 = newMetaInformations.dequeue();
      if (inferred1 === undefined) break;

      const rules = this.metaToRules[inferred1.kind].get(inferred1.shape);
      if (rules === undefined) continue;
      if (rules.length === 0) continue;

      for (const rule of rules) {        
        if (rule.dataBody === null) {
          // No data requirement: build the produced quad
          // assert(rule.metaHead.target === rule.metaBody!.target)

          const n = buildConcreteHead(rule, null, inferred1);
          if (addInMeta(metaBase, n)) {
            newMetaInformations.enqueue(n);
          }
        } else {
          // Data requirement: look for the head
          const request = {
            subject: rule.dataBody.subject.equals(rule.metaBody!.resource) ? inferred1.resource : null,
            predicate: rule.dataBody.predicate,
            object: rule.dataBody.object.equals(rule.metaBody!.resource) ? inferred1.resource : null,
          };
          
          const m = database.match(request.subject, request.predicate, request.object, $defaultGraph);
          for (const quad of m) {
            const n = buildConcreteHead(rule, quad, inferred1);
            if (addInMeta(metaBase, n)) {
              newMetaInformations.enqueue(n);
            }
          }
        }
      }
    }
  }
}

class VariableStorage {
  variables: {[name: string]: RDF.Term | undefined} = {};

  add(concrete: RDF.Term, template: RDF.Term) {
    if (template.termType !== 'Variable') return;
    this.variables[template.value] = concrete;
  }

  get(term: RDF.Term): RDF.Term {
    if (term.termType !== 'Variable') return term;

    const x = this.variables[term.value];
    if (x === undefined) throw Error("No variable named " + term.value);
    return x;
  }
}

function buildConcreteHead(rule: LogicRule, data: RDF.Quad | null, meta: MetaInfo | null): MetaInfo {
  let s = new VariableStorage();

  if (data !== null && rule.dataBody !== null) {
    s.add(data.subject, rule.dataBody.subject);
    s.add(data.object, rule.dataBody.object);
  }

  if (meta !== null && rule.metaBody !== null) {
    s.add(meta.resource, rule.metaBody.resource);
    s.add(meta.shape, rule.metaBody.shape);
  }

  return {
    resource: s.get(rule.metaHead.resource),
    kind: rule.metaHead.kind,
    shape: s.get(rule.metaHead.shape)
  };
}

function addInMeta(metaBase: MetaBaseInterface, n: MetaInfo): boolean {
  return metaBase[n.kind].add(n.resource, n.shape);
}
