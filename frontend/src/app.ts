import axios from "axios";
import * as n3 from 'n3';
import * as rdfstring from 'rdf-string';

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
})
.catch(error => console.log(error));


console.log("!!!");

//import PREC from "prec";
//const rdfgraph = PREC.cypherJsontoRDF(data, undefined);
//
//for (const quad of rdfgraph) {
//  console.log(quad.subject);
//}
