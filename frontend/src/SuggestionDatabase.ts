import * as RDF from '@rdfjs/types';
import { Store, Parser, DataFactory } from 'n3';
import axios from 'axios';
import Tribute from "tributejs";
import namespace from '@rdfjs/namespace';

const ns = {
  rdf : namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", { factory: DataFactory }),
  prec: namespace("http://bruy.at/prec#"                       , { factory: DataFactory }),
  pgo : namespace("http://ii.uwb.edu.pl/pgo#"                  , { factory: DataFactory })
};

type OntologyMember = {
  key: string,
  value: string,
  namedNode: RDF.NamedNode,
  description?: RDF.Literal
};

function toTributeValue(prefix: keyof typeof ns, namedNode: RDF.NamedNode, store: Store): OntologyMember {
  let result: OntologyMember = {
    key: namedNode.value,
    value: namedNode.value.substr(ns[prefix][''].value.length),
    namedNode: namedNode,
  }

  return result;
}

function findPrefix(term: RDF.Quad_Subject): (keyof typeof ns) | undefined {
  if (term.termType !== 'NamedNode') return undefined;

  for (const [prefix, prefixNamespace] of Object.entries(ns)) {
    if (term.value.startsWith(prefixNamespace[''].value)) {
      return prefix as (keyof typeof ns);
    }
  }

  return undefined;
}


export default class SuggestionDatabase {
  _tribute: Tribute<OntologyMember>;

  constructor() {
    //this._database = new Store();
    this._tribute = new Tribute<OntologyMember>({
      trigger: "prec:",
      values: [

      ],
      searchOpts: {
        pre: '<li>',
        post: '</li>',
        skip: false
      }
    });

    axios.get('res/prec_ontology.ttl')
    .then(answer => {
      if (answer.status !== 200) {
        console.error("Error when trying to get the ontology: Status #" + answer.status);
        return;
      }

      const store = new Store(new Parser().parse(answer.data));

      for (const quad of store.getQuads(null, ns.rdf.type, ns.prec.UISuggestable, null)) {
        const prefix = findPrefix(quad.subject);
        if (prefix === undefined) continue;

        let collection_id: number | undefined = undefined;

        if (prefix === "prec") {
          collection_id = 0;
        } else if (prefix === "pgo") {
          collection_id = 1;
        }

        if (collection_id === undefined) continue;
        if (quad.subject.termType !== 'NamedNode') continue;

        const value = toTributeValue(prefix, quad.subject, store);

        this._tribute.append(collection_id, [ value ]);
      }
    })
    .catch(err => {
      console.error("Error when trying to get the ontology");
      console.error(err);
    });
  }

  attachTo(textarea: HTMLTextAreaElement) {
    this._tribute.attach(textarea);
  }

}
