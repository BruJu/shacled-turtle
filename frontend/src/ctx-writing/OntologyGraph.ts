import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import { DataFactory, Quad, Store } from "n3";
import { SuggestableType } from "./SuggestionDatabase";
import { $defaultGraph, ns } from '../PRECNamespace';
import { termToString } from "rdf-string";
import Description from "./ontology/Description";
import { NodePosition } from "./ontology/types";
import RDFAutomata from "./ontology/RDFAutomata";

