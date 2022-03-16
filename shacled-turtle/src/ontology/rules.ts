import * as RDF from "@rdfjs/types";
import { ns, $quad as $$quad, $variable } from "../namespaces";

function $quad(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term) {
  return $$quad(
    subject as RDF.Quad_Subject,
    predicate as RDF.Quad_Predicate,
    object as RDF.Quad_Object
  );
}

export type Rule = {
  data?: RDF.Quad;
  meta?: RDF.Quad;
  production: RDF.Quad;
};

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

  shTargetNode(subject: RDF.Term, object: RDF.Term): Rule {
    return {
      production: $quad(subject, ns.sh.targetNode, object)
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

export class RulesBuilder {
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

  shTargetNode(subject: RDF.Term, object: RDF.Term): this {
    this.rules.push(this.producer.shTargetNode(subject, object));
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
}
