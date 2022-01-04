import * as n3 from 'n3';
import namespace from '@rdfjs/namespace';

export const ns = {
  rdf : namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", { factory: n3.DataFactory }),
  rdfs: namespace("http://www.w3.org/2000/01/rdf-schema#"      , { factory: n3.DataFactory }),
  xsd : namespace("http://www.w3.org/2001/XMLSchema#"          , { factory: n3.DataFactory }),
  prec: namespace("http://bruy.at/prec#"                       , { factory: n3.DataFactory }),
  pvar: namespace("http://bruy.at/prec-trans#"                 , { factory: n3.DataFactory }),
  pgo : namespace("http://ii.uwb.edu.pl/pgo#"                  , { factory: n3.DataFactory }),
  ex  : namespace("http://www.example.org/"                    , { factory: n3.DataFactory })
};
