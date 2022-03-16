import * as RDF from '@rdfjs/types';
import axios from "axios";
import { Parser } from 'n3';
import data from './base_pg.json';
import ContextCodeEditor from './ContextCodeEditor';
import { ns, boringTypes } from './PRECNamespace';
import rdfToDot from "./rdf-to-dot";
import { PREC_SHAPE_GRAPH_LINK } from './things';


class PrecDemo {
  /** Elements where d3 must draw the produced RDF graph */
  readonly D3_TARGET: string = '#rdf-as-dot';

  _pgTextArea: HTMLTextAreaElement;
  _contextWriter: ContextCodeEditor;
  _showBoringCheckbox: HTMLInputElement;

  constructor() {
    this._pgTextArea = getHtmlElement<HTMLTextAreaElement>("pg_request")!;
    this._pgTextArea.value = JSON.stringify(data, null, 2);

    this._contextWriter = new ContextCodeEditor(document.getElementById('context_div')!);
    this._contextWriter.changeOntology(PREC_SHAPE_GRAPH_LINK);

    // Buttons
    this._showBoringCheckbox = getHtmlElement<HTMLInputElement>("show_boring_types")!;
    this._showBoringCheckbox.addEventListener('change', () => { this.convert(); });

    getHtmlElement<HTMLButtonElement>('convert_button')
    .addEventListener('click', () => this.convert());

    this.convert();
  }


  convert() {
    const pgAsCypher = JSON.parse(this._pgTextArea.value);
  
    const requestObject: { pgAsCypher: string, context?: string } = {
      pgAsCypher: pgAsCypher
    };

    const contextText = this._contextWriter.getContext();
    if (contextText !== null) requestObject.context = contextText;
  
    axios.post('rest/transform_graph', requestObject)
    .then(response => {
      if (response.status !== 200) {
        console.log("rest/transform_graph -> Status " + response.status);
        return;
      }
    
      const parser = new Parser();
      const quads = parser.parse(response.data.quads);
    
      (document.getElementById("prec_answer") as HTMLTextAreaElement).value = response.data.quads as string;
    
      drawRDFGraph(this.D3_TARGET, quads, this._showBoringCheckbox.checked);
    })
    .catch(error => console.log(error));
  }
}


function getHtmlElement<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}


/** Draw the RDF graph in the container with the given name */
function drawRDFGraph(name: string, quads: RDF.Quad[], showBoring: boolean) {
  // ~~ Remove boring types to reduce bloating
  if (!showBoring) {
    quads = quads.filter(quad => {
      if (!quad.predicate.equals(ns.rdf.type)) return true;
      return boringTypes.find(type => type.equals(quad.object)) === undefined;
    }); 
  }

  // ~~ Get text representation
  const dotRepresentation = rdfToDot(quads);

  // ~~ Draw in div
  // @ts-ignore
  (d3 as any).select(name).graphviz().renderDot(dotRepresentation);
}


new PrecDemo();
