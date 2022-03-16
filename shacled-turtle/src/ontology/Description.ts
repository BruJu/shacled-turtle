import * as RDF from "@rdfjs/types";
import TermSet from "@rdfjs/term-set";
import { ns } from "../namespaces";

export default class Description {
  labels: TermSet<RDF.Literal> = new TermSet();
  comments: TermSet<RDF.Literal> = new TermSet();
  
  addLabelsAndComments(store: RDF.DatasetCore, subject: RDF.Quad_Subject) {
    Description.insertInto(store, subject, ns.rdfs.label, this.labels);
    Description.insertInto(store, subject, ns.rdfs.comment, this.comments);
    return this;
  }

  addAllComments(store: RDF.DatasetCore, focus: RDF.Quad_Subject) {
    this.addLabelsAndComments(store, focus);
    this.addAll(Description.fromShacl(store, focus));
    return this;
  }

  private static insertInto(
    store: RDF.DatasetCore,
    subject: RDF.Quad_Subject, predicate: RDF.Quad_Predicate,
    target: TermSet<RDF.Literal>
  ) {
    for (const quad of store.match(subject, predicate, null)) {
      const object = quad.object;
      if (object.termType === "Literal") {
        target.add(object);
      }
    }
  }
  
  addAll(description: Description) {
    description.labels.forEach(l => this.labels.add(l));
    description.comments.forEach(l => this.comments.add(l));
  }

  static fromShacl(store: RDF.DatasetCore, target: RDF.Quad_Subject): Description {
    const self = new Description();
    //Description.insertInto(store, target, ns.sh.apply('name'), self.labels);
    Description.insertInto(store, target, ns.sh.comment, self.comments);
    return self;
  }
}
