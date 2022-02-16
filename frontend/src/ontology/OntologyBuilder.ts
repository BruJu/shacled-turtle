import * as RDF from "@rdfjs/types";
import * as Suggestible from './Suggestible';

import addRDFS from './OntologyBuilder-rdfs';
import addSHACL from './OntologyBuilder-shacl';
import { RulesBuilder } from "./rules";
import Ruleset from "./Ruleset";
import Description from "./Description";



export default class OntologyBuilder {
  readonly rulesBuilder: RulesBuilder = new RulesBuilder();
  readonly suggestibleBuilder: Suggestible.Builder = new Suggestible.Builder();

  addRDFS(store: RDF.DatasetCore) { addRDFS(this, store); }
  addSHACL(store: RDF.DatasetCore) { addSHACL(this, store); }

  build(): Ontology {
    return new Ontology(
      new Ruleset(this.rulesBuilder.rules),
      this.suggestibleBuilder.build()
    )
  }

  static descriptionOf(dataset: RDF.DatasetCore, term: RDF.Term): Description {
    return new Description().addLabelsAndComments(dataset, term as RDF.Quad_Subject);
  }
}

export class Ontology {
  readonly ruleset: Ruleset;
  readonly suggestible: Suggestible.Database;

  constructor(ruleset: Ruleset, suggestible: Suggestible.Database) {
    this.ruleset = ruleset;
    this.suggestible = suggestible;
  }
}
