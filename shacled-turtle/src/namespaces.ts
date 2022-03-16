import namespace from '@rdfjs/namespace';
import * as n3 from 'n3';

const N3Factory = { factory: n3.DataFactory };

/** Usual namespaces */
export const ns = {
  rdf : namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", N3Factory),
  rdfs: namespace("http://www.w3.org/2000/01/rdf-schema#"      , N3Factory),
  xsd : namespace("http://www.w3.org/2001/XMLSchema#"          , N3Factory),
  pgo : namespace("http://ii.uwb.edu.pl/pgo#"                  , N3Factory),
  sh  : namespace("http://www.w3.org/ns/shacl#"                , N3Factory)
};

/** The term for the default graph */
export const $defaultGraph = n3.DataFactory.defaultGraph();

/** Builds a quad but with less letters */
export const $quad = n3.DataFactory.quad;

/** Builds a variable but with less letters */
export const $variable = n3.DataFactory.variable;
