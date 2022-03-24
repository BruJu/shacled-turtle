import TermMap from "@rdfjs/term-map";
import * as RDF from "@rdfjs/types";
import { Queue } from "mnemonist";
import * as n3 from 'n3';
import { $defaultGraph } from "../namespaces";
import { getWithDefault } from "../util";
import { MetaBaseInterface } from "./MetaDataInterface";

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
  /** The target type or shape */
  target: RDF.Term;
  /**
   * - types = the value is of type target
   * - shapes = the value must conform to the shape target
   */
  kind: "types" | "shapes";
  /** The value node */
  value: RDF.Term
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

          getWithDefault(this.metaToRules[where], logicRule.metaBody.value, () => [])
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
        metaBase.types.add(axiom.metaHead.target, axiom.metaHead.value);
      } else {
        metaBase.shapes.add(axiom.metaHead.target, axiom.metaHead.value);
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
        const resourceToCheck = extractFromData(tripleBasedRule.dataBody!, metaBody.target);
        const classifiedAs = metaBase[metaBody.kind].getAll(resourceToCheck);

        if (classifiedAs.has(metaBody.value)) {
          // Has the type or shape required by the meta rule, ok
        } else {
          // Can not match the meta part, bad
          continue;
        }
      }

      const metaHead = tripleBasedRule.metaHead;

      // What is the obtained shape or type?
      const resourceWithNewMeta = extractFromData(tripleBasedRule.dataBody!, metaHead.target);

      // Who gets the obtained shape or type?
      const objectValue = metaHead.value.termType === "Variable"
        ? extractFromData(tripleBasedRule.dataBody!, metaHead.value)
        : metaHead.value;
      
      // Add it
      const unstable = metaBase[metaHead.kind].add(resourceWithNewMeta, objectValue);
      if (unstable) {
        inferredMeta.push({ target: resourceWithNewMeta, kind: metaHead.kind, value: objectValue });
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

      const rules = this.metaToRules[inferred1.kind].get(inferred1.value);
      if (rules === undefined) continue;
      if (rules.length === 0) continue;

      for (const rule of rules) {        
        if (rule.dataBody === null) {
          // No data requirement: build the produced quad
          // assert(rule.metaHead.target === rule.metaBody!.target)

          const unstable = metaBase[rule.metaHead.kind].add(inferred1.target, rule.metaHead.value);
          if (unstable) newMetaInformations.enqueue({
            target: inferred1.target,
            kind: rule.metaHead.kind,
            value: rule.metaHead.value
          });
        } else {
          // Data requirement: look for the head
          const request = {
            subject: rule.dataBody.subject.equals(rule.metaBody!.target) ? inferred1.target : null,
            predicate: rule.dataBody.predicate,
            object: rule.dataBody.object.equals(rule.metaBody!.target) ? inferred1.target : null,
          };
          
          const getProductedTarget = buildProducedTargetFunction(rule, request);

          const m = database.match(request.subject, request.predicate, request.object, $defaultGraph);
          for (const quad of m) {
            const producedTarget = getProductedTarget(quad);
            const unstable = metaBase[rule.metaHead.kind].add(producedTarget, rule.metaHead.value);
            if (unstable) {
              newMetaInformations.enqueue({
                target: producedTarget,
                kind: rule.metaHead.kind,
                value: rule.metaHead.value
              });
            }
          }
        }
      }
    }
  }
}


function buildProducedTargetFunction(
  rule: LogicRule, request: { subject: RDF.Term | null }
): ((quad: RDF.Quad) => RDF.Term) {

  if (rule.metaHead.target.equals(rule.metaBody!.target)) {
    return () => request.subject!;
  } else if (rule.dataBody!.subject.equals(rule.metaBody!.target)) {
    return (quad: RDF.Quad) => quad.object;
  } else {
    return (quad: RDF.Quad) => quad.object;
  }
}
