import axios from "axios";
import * as n3 from 'n3';
import * as rdfstring from 'rdf-string';
import * as RDF from '@rdfjs/types';
import TermMap from '@rdfjs/term-map';
import SuggestionDatabase from "./SuggestionDatabase";

import namespace from '@rdfjs/namespace';

const ns = {
  rdf : namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", { factory: n3.DataFactory }),
  rdfs: namespace("http://www.w3.org/2000/01/rdf-schema#"      , { factory: n3.DataFactory }),
  xsd : namespace("http://www.w3.org/2001/XMLSchema#"          , { factory: n3.DataFactory }),
  prec: namespace("http://bruy.at/prec#"                       , { factory: n3.DataFactory }),
  pvar: namespace("http://bruy.at/prec-trans#"                 , { factory: n3.DataFactory }),
  pgo : namespace("http://ii.uwb.edu.pl/pgo#"                  , { factory: n3.DataFactory }),
  ex  : namespace("http://www.example.org/"                    , { factory: n3.DataFactory })
};


function getHtmlElement<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

import data from './base_pg.json';

getHtmlElement<HTMLTextAreaElement>("pg_request").value = JSON.stringify(data, null, 2);
getHtmlElement<HTMLTextAreaElement>("input_context").value = "";

const boringTypes = [
  ns.prec.CreatedEdgeLabel, ns.prec.CreatedNodeLabel, ns.prec.CreatedPropertyKey,
  ns.pgo.Node, ns.pgo.Edge, ns.prec.PropertyKey, ns.prec.PropertyKeyValue
];

function drawRDFGraph(name: string, quads: RDF.Quad[]) {
  const showBoring = getHtmlElement<HTMLInputElement>("show_boring_types").checked;

  if (!showBoring) {
    quads = quads.filter(quad => {
      if (!quad.predicate.equals(ns.rdf.type)) return true;
      return boringTypes.find(type => type.equals(quad.object)) === undefined;
    }); 
  }

  const dotRepresentation = rdfToDot(quads);

  // For debugging
  // getHtmlElement<HTMLTextAreaElement>("input_context").value = dotRepresentation;

  // @ts-ignore
  (d3 as any).select(name).graphviz().renderDot(dotRepresentation);
}

{
  const showBoring = getHtmlElement<HTMLInputElement>("show_boring_types");
  showBoring.addEventListener('change', () => {
    convert();
  });
}


function esc(s: string): string {
  return s.replaceAll('"', '\\"');
}

function toDotNodeId(term: RDF.Term): string {
  return term.termType + " " + esc(rdfstring.termToString(term));
}

function toDotDisplay(namedNode: RDF.NamedNode | RDF.Variable): string {
  if (namedNode.termType === 'Variable') {
    return '?' + namedNode.value;
  }

  for (const [prefix, iri] of Object.entries(ns)) {
    if (namedNode.value.startsWith(iri[''].value)) {
      return prefix + ":" + namedNode.value.substring(iri[''].value.length);
    }
  }

  return namedNode.value;
}

function rdfToDot(quads: RDF.Quad[]): string {
  let nodes = new TermMap<RDF.Term, string>();
  let dotLines: string[] = [];

  for (const quad of quads) {
    const subjectId = toDotNodeId(quad.subject);
    const predicateName = toDotDisplay(quad.predicate);
    const objectId = toDotNodeId(quad.object);

    dotLines.push(`"${subjectId}" -> "${objectId}" [label="${predicateName}"]`);

    nodes.set(quad.subject, subjectId);
    nodes.set(quad.object, objectId);
  }

  for (const [term, nodeName] of nodes) {
    if (term.termType === 'NamedNode') {
      dotLines.push(`"${nodeName}" [label="${toDotDisplay(term)}"]`)
    } else if (term.termType === 'BlankNode') {
      dotLines.push(`"${nodeName}" [label=""]`)
    } else if (term.termType === 'Literal') {
      dotLines.push(`"${nodeName}" [label="${esc(rdfstring.termToString(term))}" shape="none"]`)
    }
  }

  return "digraph {\n " + dotLines.join("\n") + "\n } ";
}

function extractContext(textarea: HTMLTextAreaElement) {
  const rawText = textarea.value;

  if (rawText === '') return null;

  let s = Object.entries(ns).map(([prefix, namedNode]) => {
    return `@prefix ${prefix}: <${namedNode[''].value}> .`
  }).join("\n") + "\n" + rawText;

  return s;
};

function convert() {
  const inputPGDom = document.getElementById('pg_request') as HTMLTextAreaElement;
  const data = JSON.parse(inputPGDom.value);

  const textareaContext = getHtmlElement<HTMLTextAreaElement>("input_context");
  const contextText = extractContext(textareaContext);

  if (contextText === undefined) {
    // Error
    return;
  }

  const requestObject: { pgAsCypher: string, context?: string } = {
    pgAsCypher: data
  };
  if (contextText !== null) requestObject.context = contextText;

  axios.post('rest/transform_graph', requestObject)
  .then(response => {
    if (response.status !== 200) {
      console.log(":(");
      return;
    }
  
    const parser = new n3.Parser();
    const quads = parser.parse(response.data.quads);
  
    console.log(quads);
  
    for (const quad of quads) {
      console.log(rdfstring.termToString(quad));
    }
  
    (document.getElementById("prec_answer") as HTMLTextAreaElement).value = response.data.quads as string;
  
    drawRDFGraph("#rdf-as-dot", quads);
  })
  .catch(error => console.log(error));
}

convert();



getHtmlElement<HTMLButtonElement>('convert_button').addEventListener('click', convert);

const suggestionsDB = new SuggestionDatabase();
suggestionsDB.attachTo(document.getElementById("input_context") as any);

