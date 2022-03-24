import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import { ns } from "../namespaces";

/**
 * The description of a term = the set of its labels and comments
 */
export default class Description {
  /** List of labels */
  labels: TermSet<RDF.Literal> = new TermSet();
  /** List of comments */
  comments: TermSet<RDF.Literal> = new TermSet();
  
  /** Fill the list of labels and comments from RDFS */
  addLabelsAndComments(store: RDF.DatasetCore, subject: RDF.Quad_Subject) {
    Description.insertInto(store, subject, ns.rdfs.label, this.labels);
    Description.insertInto(store, subject, ns.rdfs.comment, this.comments);
    return this;
  }

  /** Fill the list of labels and comments both from RDFS and SHACL */
  addAllComments(store: RDF.DatasetCore, focus: RDF.Quad_Subject) {
    this.addLabelsAndComments(store, focus);
    this.addAll(Description.fromShacl(store, focus));
    return this;
  }
  
  /**
   * Add all labels and comments contained in source in this instance
   * @param source The source description
   */
  addAll(source: Description) {
    source.labels.forEach(l => this.labels.add(l));
    source.comments.forEach(l => this.comments.add(l));
  }

  /**
   * Build an new description initialized with the name and comment from
   * SHACL.
   */
  private static fromShacl(store: RDF.DatasetCore, target: RDF.Quad_Subject): Description {
    const self = new Description();
    //Description.insertInto(store, target, ns.sh.apply('name'), self.labels);
    Description.insertInto(store, target, ns.sh.comment, self.comments);
    return self;
  }
  
  /**
   * Add every object of the request `store.match(subject, predicate)` that
   * happens to be a literal in the target set.
   * @param store The dataset
   * @param subject The subject
   * @param predicate The predicate
   * @param target The set of literals
   */
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
}
