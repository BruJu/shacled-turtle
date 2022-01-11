import namespace from '@rdfjs/namespace';
import * as n3 from 'n3';

const N3Factory = { factory: n3.DataFactory };

/** Namespaces related to PREC */
export const ns = {
  rdf : namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", N3Factory),
  rdfs: namespace("http://www.w3.org/2000/01/rdf-schema#"      , N3Factory),
  xsd : namespace("http://www.w3.org/2001/XMLSchema#"          , N3Factory),
  prec: namespace("http://bruy.at/prec#"                       , N3Factory),
  pvar: namespace("http://bruy.at/prec-trans#"                 , N3Factory),
  pgo : namespace("http://ii.uwb.edu.pl/pgo#"                  , N3Factory),
  ex  : namespace("http://www.example.org/"                    , N3Factory),
  sh  : namespace("http://www.w3.org/ns/shacl#"                , N3Factory)
};

/** The term for the default graph */
export const $defaultGraph = n3.DataFactory.defaultGraph();

export const $quad = n3.DataFactory.quad;

/**
 * Types related to PG description in RDF. Generally not that interesting to
 * represent and contributes to "graph bloat".
 */
export const boringTypes = [
  ns.prec.CreatedEdgeLabel, ns.prec.CreatedNodeLabel, ns.prec.CreatedPropertyKey,
  ns.pgo.Node, ns.pgo.Edge, ns.prec.PropertyKey, ns.prec.PropertyKeyValue
];
