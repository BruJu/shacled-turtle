import * as RDF from '@rdfjs/types';
import TermMap from '@rdfjs/term-map';
import * as rdfstring from 'rdf-string';
import { ns } from './PRECNamespace';

/**
 * Map a list of triples into a dot representation of the graph
 * @param triples The triples to display 
 * @returns A dot repesentation of the graph
 */
export default function rdfToDot(triples: RDF.Quad[]): string {
  let nodes = new TermMap<RDF.Term, string>();
  let dotLines: string[] = [];

  // Edges of the digraph
  for (const triple of triples) {
    const subjectId = toDotNodeId(triple.subject);
    const predicateName = toDotDisplay(triple.predicate);
    const objectId = toDotNodeId(triple.object);

    dotLines.push(`"${subjectId}" -> "${objectId}" [label="${predicateName}"]`);

    nodes.set(triple.subject, subjectId);
    nodes.set(triple.object, objectId);
  }

  // Nodes of the digraph (change their label / shape)
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

/** Transform the given node to a human readable name */
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

/** Transform the term into a unique identifier for the dot representation */
function toDotNodeId(term: RDF.Term): string {
  return term.termType + " " + esc(rdfstring.termToString(term));
}

/** Escape all double quotes of a string for display in dot format */
function esc(s: string): string {
  return s.replaceAll('"', '\\"');
}
