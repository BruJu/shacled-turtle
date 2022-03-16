import TermMap from "@rdfjs/term-map";
import { TermSet } from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types"
import { termToString } from "rdf-string";
import { $defaultGraph, ns } from "../namespaces";
import { getWithDefault } from "../util";
import * as Build from "./rules";
import * as n3 from 'n3';

type MetaKind = "types" | "shapes";

type MetaInfo = {
  target: RDF.Term;
  kind: MetaKind;
  value: RDF.Term
};

type LogicRule = {
  dataBody?: RDF.Quad;
  metaBody?: MetaInfo;
  metaHead: MetaInfo;
};

export default class Ruleset {
  private readonly dataPredicateToRules: TermMap<RDF.Term, LogicRule[]> = new TermMap();

  private readonly metaToRules: {
    types: TermMap<RDF.Term, LogicRule[]>,
    shapes: TermMap<RDF.Term, LogicRule[]>
  } = {
    types: new TermMap(),
    shapes: new TermMap()
  };

  private readonly axioms: Array<LogicRule> = [];

  constructor(buildRules: Build.Rule[]) {
    for (const rule of buildRules) {
      const logicRule = toLogicRule(rule);

      if (logicRule.dataBody === undefined && logicRule.metaBody === undefined) {
        this.axioms.push(logicRule);
      } else {
        if (logicRule.dataBody !== undefined) {
          getWithDefault(this.dataPredicateToRules, logicRule.dataBody.predicate, () => [])
          .push(logicRule);
        }

        if (logicRule.metaBody !== undefined) {
          const where = logicRule.metaBody.kind;

          getWithDefault(this.metaToRules[where], logicRule.metaBody.value, () => [])
          .push(logicRule);
        }
      }
    }
  }

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
  
  onNewTriple(newTriple: RDF.Quad, database: RDF.DatasetCore, metaBase: MetaBaseInterface): this {
    const inferred = this.addTriple(newTriple, metaBase);
    if (inferred === null) return this;

    this.closeMeta(inferred, database, metaBase);
    return this;
  }

  private addTriple(newTriple: RDF.Quad, metaBase: MetaBaseInterface): Array<MetaInfo> | null {
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

    let inferredMeta: Array<MetaInfo> = [];

    for (const tripleBasedRule of relevantRules) {
      if (tripleBasedRule.metaBody === undefined) {
        // ok
      } else {
        const metaBody = tripleBasedRule.metaBody;
        const resourceToCheck = extractFromData(tripleBasedRule.dataBody!, metaBody.target);
        const classifiedAs = metaBase[metaBody.kind].getAll(resourceToCheck);

        if (classifiedAs.has(metaBody.value)) {
          // ok
        } else {
          continue;
        }
      }

      const metaHead = tripleBasedRule.metaHead;
      const resourceWithNewMeta = extractFromData(tripleBasedRule.dataBody!, metaHead.target);

      const objectValue = metaHead.value.termType === "Variable"
        ? extractFromData(tripleBasedRule.dataBody!, metaHead.value)
        : metaHead.value;
      
      const unstable = metaBase[metaHead.kind].add(resourceWithNewMeta, objectValue);
      if (unstable) {
        inferredMeta.push({ target: resourceWithNewMeta, kind: metaHead.kind, value: objectValue });
      }
    }

    return inferredMeta;
  }

  private closeMeta(inferred: Array<MetaInfo>, database: RDF.DatasetCore, metaBase: MetaBaseInterface) {
    while (true) {
      const inferred1 = inferred.shift();
      if (inferred1 === undefined) break;

      const rules = this.metaToRules[inferred1.kind].get(inferred1.value);
      if (rules === undefined) continue;
      if (rules.length === 0) continue;

      for (const rule of rules) {        
        if (rule.dataBody === undefined) {
          // assert(rule.metaHead.target === rule.metaBody!.target)

          const unstable = metaBase[rule.metaHead.kind].add(inferred1.target, rule.metaHead.value);
          if (unstable) inferred.push({
            target: inferred1.target,
            kind: rule.metaHead.kind,
            value: rule.metaHead.value
          });
        } else {
          const request = {
            subject: rule.dataBody.subject.equals(rule.metaBody!.target) ? inferred1.target : null,
            predicate: rule.dataBody.predicate,
            object: rule.dataBody.object.equals(rule.metaBody!.target) ? inferred1.target : null,
          };

          const produceWho = rule.metaHead.target.equals(rule.metaBody!.target) ? () => request.subject!
            : rule.dataBody.subject.equals(rule.metaBody!.target)               ? (quad: RDF.Quad) => quad.object
                                                                                : (quad: RDF.Quad) => quad.subject;

          const m = database.match(request.subject, request.predicate, request.object, $defaultGraph);
          for (const quad of m) {
            const producedTarget = produceWho(quad);
            const unstable = metaBase[rule.metaHead.kind].add(producedTarget, rule.metaHead.value);
            if (unstable) {
              inferred.push({
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

export interface MetaBaseInterfaceComponent {
  add(resource: RDF.Term, classifier: RDF.Term): boolean;
  getAll(resource: RDF.Term): TermSet<RDF.Term>;
}

export interface MetaBaseInterface {
  types: MetaBaseInterfaceComponent;
  shapes: MetaBaseInterfaceComponent;
}

function toLogicRule(buildRule: Build.Rule): LogicRule {
  function mapData(term: RDF.Quad) {
    if (term.predicate.termType === 'Variable') {
      throw Error("Invalid build data rule " + termToString(term));
    }

    return term;
  }

  function mapMeta(term: RDF.Quad): MetaInfo {
    if (term.predicate.equals(ns.rdf.type)) {
      return {
        target: term.subject,
        kind: 'types',
        value: term.object
      };
    } else if (term.predicate.equals(ns.sh.targetNode)) {
      return {
        target: term.object,
        kind: 'shapes',
        value: term.subject
      };
    } else {
      throw Error("Invalid build meta rule " + termToString(term));
    }
  }

  const result: LogicRule = {
    metaHead: mapMeta(buildRule.production)
  };

  if (buildRule.data !== undefined) result.dataBody = mapData(buildRule.data);
  if (buildRule.meta !== undefined) result.metaBody = mapMeta(buildRule.meta);

  return result;
}
