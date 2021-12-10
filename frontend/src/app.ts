import axios from "axios";
import * as n3 from 'n3';
import * as rdfstring from 'rdf-string';
import * as RDF from '@rdfjs/types';

const data = [
  {
    src: {
      identity: 8,
      labels: ["Person"],
      properties: {
        name: "Emil Eifrem",
        born: 1978,
      },
    },
    edge: {
      identity: 7,
      start: 8,
      end: 0,
      type: "ACTED_IN",
      properties: {
        roles: ["Emil"],
      },
    },
    dest: {
      identity: 0,
      labels: ["Movie"],
      properties: {
        tagline: "Welcome to the Real World",
        title: "The Matrix",
        released: 1999,
      },
    },
  },
];

(document.getElementById("pg_request") as HTMLTextAreaElement).value = JSON.stringify(data, null, 2);

//document.getElementById("pg_request")?.value = JSON.stringify(data, null, 2);

axios.post('rest/transform_graph', data)
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

function drawRDFGraph(name: string, quads: RDF.Quad[]) {
  const dotRepresentation = rdfToDot(quads);

  // @ts-ignore
  let d = d3 as any;

  d.select(name).graphviz().renderDot(dotRepresentation);

  (document.getElementById("dot") as HTMLTextAreaElement).value = dotRepresentation as string;
}

function esc(s: string): string {
  return s.replaceAll('"', '\\"');
}

function rdfToDot(quads: RDF.Quad[]): string {
  let dotLines: string[] = [];

  for (const quad of quads) {
    const { subject, predicate, object } = rdfstring.quadToStringQuad(quad);
    dotLines.push(`"${(subject)}" -> "${esc(object)}" [label="${(predicate)}"]`);
  }

  return "digraph {\n " + dotLines.join("\n") + "\n } ";
}


console.log("!!!");

//import PREC from "prec";
//const rdfgraph = PREC.cypherJsontoRDF(data, undefined);
//
//for (const quad of rdfgraph) {
//  console.log(quad.subject);
//}
