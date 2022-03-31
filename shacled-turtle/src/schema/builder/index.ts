import * as RDF from "@rdfjs/types";
import Ontology from "..";
import Description from "../Description";
import InferenceDBBuilder from "./DBBuilder-Inference";
import SuggestionDBBuilder from "./DBBuilder-Suggestion";
import addRDFS from "./rdfs";
import addSHACL from "./shacl";
import rdfNamespace from "@rdfjs/namespace";
import { $defaultGraph } from "../../namespaces";

/** A builder for an ontology. */
// Mainly used to split the code related to RDFS and SHACL in two separates files
export default class OntologyBuilder {
  readonly rulesBuilder: InferenceDBBuilder = new InferenceDBBuilder();
  readonly suggestibleBuilder: SuggestionDBBuilder = new SuggestionDBBuilder();

  addRDFS(store: RDF.DatasetCore) { addRDFS(this, store); }
  addSHACL(store: RDF.DatasetCore) { addSHACL(this, store); }

  build(): Ontology {
    return new Ontology(
      this.rulesBuilder.build(),
      this.suggestibleBuilder.build()
    )
  }

  addMisc(store: RDF.DatasetCore) {
    const schemaNs = rdfNamespace("http://schema.org/");

    for (const quad of store.match(null, schemaNs.domainIncludes, null, $defaultGraph)) {
      this.suggestibleBuilder.addExistingType(quad.object, new Description());
      this.suggestibleBuilder.addTypePath(quad.object, quad.subject as RDF.NamedNode, new Description());
    }

    for (const quad of store.match(null, schemaNs.rangeIncludes, null, $defaultGraph)) {
      this.suggestibleBuilder.addTypePathTarget(
        null, quad.subject as RDF.NamedNode, { type: quad.object }
      )
    }
  }

  static descriptionOf(dataset: RDF.DatasetCore, term: RDF.Term): Description {
    return new Description().addLabelsAndComments(dataset, term as RDF.Quad_Subject);
  }
}
