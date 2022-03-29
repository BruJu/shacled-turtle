import axios from 'axios';
import * as RDF from "@rdfjs/types";
import * as n3 from "n3";
import { ns } from './namespaces';

const PREFIXCC = "https://prefix.cc/popular/all.file.json";


export default class ExistingPrefixes {
  prefixes: {[prefix: string]: RDF.NamedNode} = {};

  constructor() {
    for (const [prefix, url] of Object.entries(ns)) {
      this.prefixes[prefix] = url[''];
    }
  }

  load(url: string = PREFIXCC) {
    axios.get<{[prefix: string]: string}>(url)
    .then(result => {
      if (result.status === 200) {
        for (const [prefix, url] of Object.entries(result.data)) {
          this.prefixes[prefix] = n3.DataFactory.namedNode(url);
        }

        console.log("prefixes.cc = ok");
      } else {
        // noop
      }
    })
    .catch(_error => {
      // noop
    });
  }

  getUrlForPrefix(prefix: string): RDF.NamedNode | null {
    const x = this.prefixes[prefix];
    if (x === undefined) return null;
    return x;
  }
}
