import * as RDF from "@rdfjs/types";
import Schema from "..";
import Description from "../Description";
import InferenceEngineBuilder from "./InferenceEngineBuilder";
import SuggestionEngineBuilder from "./SuggestionEngineBuilder";
import addRDFS from "./rdfs";
import addSHACL from "./shacl";
import rdfNamespace from "@rdfjs/namespace";
import { $defaultGraph } from "../../namespaces";

/** A builder for a schema. */
// Mainly used to split the code related to RDFS and SHACL in two separates files
export default class SchemaBuilder {
  readonly rulesBuilder: InferenceEngineBuilder = new InferenceEngineBuilder();
  readonly suggestibleBuilder: SuggestionEngineBuilder = new SuggestionEngineBuilder();

  addRDFS(store: RDF.DatasetCore) { addRDFS(this, store); }
  addSHACL(store: RDF.DatasetCore) { addSHACL(this, store); }

  build(): Schema {
    return new Schema(
      this.rulesBuilder.build(),
      this.suggestibleBuilder.build()
    )
  }

  addMisc(store: RDF.DatasetCore) {
    const schemaNs = rdfNamespace("http://schema.org/");

    for (const quad of store.match(null, schemaNs.domainIncludes, null, $defaultGraph)) {
      this.suggestibleBuilder.addExistingType(quad.object, SchemaBuilder.descriptionOf(store, quad.object));
      this.suggestibleBuilder.addTypePath(quad.object, quad.subject as RDF.NamedNode, SchemaBuilder.descriptionOf(store, quad.subject));
    }

    for (const quad of store.match(null, schemaNs.rangeIncludes, null, $defaultGraph)) {
      this.suggestibleBuilder.addExistingType(quad.object, SchemaBuilder.descriptionOf(store, quad.object));
      this.suggestibleBuilder.addTypePathTarget(
        null, quad.subject as RDF.NamedNode, { type: quad.object }
      )
    }
  }

  static descriptionOf(dataset: RDF.DatasetCore, term: RDF.Term): Description {
    return new Description().addLabelsAndComments(dataset, term as RDF.Quad_Subject);
  }
}
