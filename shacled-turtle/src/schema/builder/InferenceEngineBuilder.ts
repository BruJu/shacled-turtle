import * as RDF from "@rdfjs/types";
import { termToString } from "rdf-string";
import { $quad as $$quad, $variable, ns } from "../../namespaces";
import InferenceEngine, { LogicRule, MetaTriple } from "../InferenceEngine";

function $quad(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term) {
  return $$quad(
    subject as RDF.Quad_Subject,
    predicate as RDF.Quad_Predicate,
    object as RDF.Quad_Object
  );
}

/**
 * General purpose rule with:
 * - 0 or 1 required data triple
 * - 0 or 1 required meta triple
 * - 1 produced triple
 * 
 * Note that while the ruleset is exprimed with any triple, our application
 * restricts the range of predicates that can be used for meta and produced
 * triples, but this particularity is catched by LogicRule
 */
type Rule = {
  data?: RDF.Quad;
  meta?: RDF.Quad;
  production: RDF.Quad;
};

/**
 * Maps all elementary RDFS and SHACL rules into an inference rule in our
 * system.
 */
export default class InferenceEngineBuilder {
  readonly producer: RuleProducer = new RuleProducer();
  readonly rules: Rule[] = [];

  rdfType(): this {
    this.rules.push(this.producer.rdfType());
    return this;
  }

  rdfsDomain(url: RDF.Term, type: RDF.Term): this {
    this.rules.push(this.producer.rdfsDomain(url, type));
    return this;
  }

  rdfsRange(url: RDF.Term, type: RDF.Term): this {
    this.rules.push(this.producer.rdfsRange(url, type));
    return this;
  }

  rdfsSubClassOf(subclass: RDF.Term, superclass: RDF.Term): this {
    this.rules.push(this.producer.rdfsSubClassOf(subclass, superclass));
    return this;
  }

  shTargetNode(shape: RDF.Term, node: RDF.Term): this {
    this.rules.push(this.producer.shTargetNode(shape, node));
    return this;
  }

  shTargetClass(subject: RDF.Term, object: RDF.Term): this {
    this.rules.push(this.producer.shTargetClass(subject, object));
    return this;
  }

  shSubjectsOf(shape: RDF.Term, url: RDF.Term): this {
    this.rules.push(this.producer.shSubjectsOf(shape, url));
    return this;
  }

  shObjectsOf(shape: RDF.Term, url: RDF.Term): this {
    this.rules.push(this.producer.shObjectsOf(shape, url));
    return this;
  }

  shSubShape(subshape: RDF.Term, supershape: RDF.Term): this {
    this.rules.push(this.producer.shSubShape(subshape, supershape));
    return this;
  }

  shPredicatePath(source: RDF.Term, predicatePath: RDF.Term, destination: RDF.Term): this {
    this.rules.push(this.producer.shPredicatePath(source, predicatePath, destination));
    return this;
  }

  shInversePredicatePath(source: RDF.Term, predicatePath: RDF.Term, destination: RDF.Term): this {
    this.rules.push(this.producer.shInversePredicatePath(source, predicatePath, destination));
    return this;
  }
  

  build(): InferenceEngine {
    const logicRules = this.rules.map(rule => toLogicRule(rule));
    return new InferenceEngine(logicRules);
  }
}

////////////////////////////////////////////////////////////////////////////////
// ==== Set of rules

/** Mapping from RDFS / SHACL to inference rules in our system */
class RuleProducer {
  rdfType(): Rule {
    return {
      data: $quad($variable("u"), ns.rdf.type, $variable("x")),
      production: $quad($variable("u"), ns.rdf.type, $variable("x"))
    };
  }

  rdfsDomain(url: RDF.Term, type: RDF.Term): Rule {
    return {
      data: $quad($variable("u"), url, $variable("v")),
      production: $quad($variable("u"), ns.rdf.type, type)
    };
  }

  rdfsRange(url: RDF.Term, type: RDF.Term): Rule {
    return {
      data: $quad($variable("u"), url, $variable("v")),
      production: $quad($variable("v"), ns.rdf.type, type)
    };
  }

  rdfsSubClassOf(subclass: RDF.Term, superclass: RDF.Term): Rule {
    return {
      meta: $quad($variable("u"), ns.rdf.type, subclass),
      production: $quad($variable("u"), ns.rdf.type, superclass)
    };
  }

  shTargetNode(shape: RDF.Term, node: RDF.Term): Rule {
    return {
      production: $quad(shape, ns.sh.targetNode, node)
    };
  }

  shTargetClass(subject: RDF.Term, object: RDF.Term): Rule {
    return {
      meta: $quad($variable("u"), ns.rdf.type, object),
      production: $quad(subject, ns.sh.targetNode, $variable("u"))
    };
  }

  shSubjectsOf(shape: RDF.Term, url: RDF.Term): Rule {
    return {
      data: $quad($variable("u"), url, $variable("v")),
      production: $quad(shape, ns.sh.targetNode, $variable("u"))
    };
  }

  shObjectsOf(shape: RDF.Term, url: RDF.Term): Rule {
    return {
      data: $quad($variable("u"), url, $variable("v")),
      production: $quad(shape, ns.sh.targetNode, $variable("v"))
    };
  }

  shSubShape(subshape: RDF.Term, supershape: RDF.Term): Rule {
    return {
      meta: $quad(subshape, ns.sh.targetNode, $variable("u")),
      production: $quad(supershape, ns.sh.targetNode, $variable("u"))
    };
  }

  shPredicatePath(source: RDF.Term, predicatePath: RDF.Term, destination: RDF.Term) {
    return {
      data: $quad($variable("u"), predicatePath, $variable("v")),
      meta: $quad(source, ns.sh.targetNode, $variable("u")),
      production: $quad(destination, ns.sh.targetNode, $variable("v"))
    };
  }

  shInversePredicatePath(source: RDF.Term, predicatePath: RDF.Term, destination: RDF.Term) {
    return {
      data: $quad($variable("u"), predicatePath, $variable("v")),
      meta: $quad(destination, ns.sh.targetNode, $variable("v")),
      production: $quad(source, ns.sh.targetNode, $variable("u"))
    }
  }
}


////////////////////////////////////////////////////////////////////////////////
// ==== Building process

/** Transform a general purpose Rule into a LogicRule */
function toLogicRule(buildRule: Rule): LogicRule {
  function mapData(term: RDF.Quad) {
    if (term.predicate.termType === 'Variable') {
      throw Error("Invalid build data rule " + termToString(term));
    }

    return term;
  }

  function mapMeta(term: RDF.Quad): MetaTriple {
    if (term.predicate.equals(ns.rdf.type)) {
      return {
        resource: term.subject,
        kind: 'types',
        shape: term.object
      };
    } else if (term.predicate.equals(ns.sh.targetNode)) {
      return {
        resource: term.object,
        kind: 'shapes',
        shape: term.subject
      };
    } else {
      throw Error("Invalid build meta rule " + termToString(term));
    }
  }

  const result: LogicRule = {
    dataBody: null,
    metaBody: null,
    metaHead: mapMeta(buildRule.production)
  };

  if (buildRule.data !== undefined) result.dataBody = mapData(buildRule.data);
  if (buildRule.meta !== undefined) result.metaBody = mapMeta(buildRule.meta);

  return result;
}
