import * as RDF from '@rdfjs/types';
import { Store, Parser } from 'n3';
import axios from 'axios';
import Tribute, { TributeCollection, TributeItem } from "tributejs";
import { ns } from './PRECNamespace';

/**
 * A member of the ontology, ie a term that may be recommanded by the context
 * editor
 */
 type OntologyMember = {
  key: string,
  value: string,
  prefix: string,
  suffix: string,
  namedNode: RDF.NamedNode,
  description?: RDF.Literal
};

function isDefined<T>(t: T | undefined): t is T {
  return t !== undefined;
}

export default async function attachContextAutoCompletitionTo(elementId: string) {
  try {
    const answer = await axios.get('res/prec_ontology.ttl');

    if (answer.status !== 200) {
      console.error("Error when trying to get the ontology: Status #" + answer.status);
      return;
    }

    const store = new Store(new Parser().parse(answer.data));

    const values = store.getQuads(null, ns.rdf.type, ns.prec.UISuggestable, null)
    .map(quad => toTributeValue(quad.subject, store))
    .filter(isDefined);

    const collections: TributeCollection<OntologyMember>[] = Object.keys(ns)
    .map(prefixName => ({
      trigger: prefixName + ":",
      values: values.filter(v => v.prefix === prefixName).map(v => v.value),
      selectTemplate(item: TributeItem<OntologyMember> | undefined) {
        if (item === undefined) return '';
        return prefixName + ":" + item.original.value;
      },
      selectClass: "selectedautocomplete",
      noMatchTemplate: undefined,
      menuItemTemplate(item: TributeItem<OntologyMember>) {
        let s = item.original.prefix + ":"
          + "<strong>" + item.original.suffix + "</strong>";
        if ('description' in item.original) {
          s += " - " + item.original.description!.value;
        }
        return s;
      }
    }))
    .filter(collection => collection.values.length !== 0);

    console.log(collections);

    const tribute = new Tribute({ collection: collections as any });
    tribute.attach(document.getElementById(elementId)!);

  } catch (error) {
    console.error("Error during the ontology loading");
    console.error(error);
  }
}



/**
 * Transforms a named node into an objet suitable to be integrated into the TributeJS
 * list for autocompletion.
 * @param namedNode 
 * @param store 
 * @returns 
 */
function toTributeValue(namedNode: RDF.Quad_Subject, store: Store)
: { prefix: string, value: OntologyMember } | undefined {
  if (namedNode.termType !== 'NamedNode') return undefined;

  const nsAsArray = Object.entries(ns);

  let collectionId = null;
  for (let i = 0; i != nsAsArray.length && collectionId === null; ++i) {
    const notShortenedPrefix = nsAsArray[i][1][''].value;
    if (namedNode.value.startsWith(notShortenedPrefix)) {
      collectionId = i;
    }
  }

  if (collectionId === null) return undefined;
  
  const [prefix, prefixNamespace] = nsAsArray[collectionId];
  const unshortenedPrefix = prefixNamespace[''].value;
  
  let result: OntologyMember = {
    key: namedNode.value,
    prefix: prefix as keyof typeof ns,
    value: namedNode.value.substr(unshortenedPrefix.length),
    suffix: namedNode.value.substr(unshortenedPrefix.length),
    namedNode: namedNode,
  };

  const descriptions = store.getQuads(namedNode, ns.rdfs.comment, null, null);
  if (descriptions.length > 0 && descriptions[0].object.termType === 'Literal') {
    result.description = descriptions[0].object;
  }

  return { prefix: nsAsArray[collectionId][0], value: result };
}

