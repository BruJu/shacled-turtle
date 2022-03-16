import * as RDF from "@rdfjs/types";
import TermSet from "@rdfjs/term-set";
import { ns } from "../namespaces";
import * as AC from "@bruju/automata-composer";
import { stringToTerm, termToString } from "rdf-string";

export default function addPath(
  pathName: RDF.Term, shapeGraph: RDF.DatasetCore,
  writer: PathWriter
) {
  const composed = decompose(pathName, shapeGraph);
  if (composed === null) return false;

  const fsa = composed.build();

  let stateIdToTerm = new Map<number, RDF.Term>();
  function getNodeTypeOfStateId(id: number): RDF.Term {
    let r = stateIdToTerm.get(id);
    if (r === undefined) {
      r = writer.generateBlankType();
      stateIdToTerm.set(id, r);
    }
    return r;
  }

  stateIdToTerm.set(fsa.start.id, writer.startType);

  if (writer.endType !== null) {
    if (fsa.ends.length === 1) {
      if (fsa.start.id === fsa.ends[0].id) {
        writer.addSubshape(writer.startType, writer.endType);
      } else {
        stateIdToTerm.set(fsa.ends[0].id, writer.endType);
      }
    } else {
      for (const end of fsa.ends) {
        const node = getNodeTypeOfStateId(end.id);
        writer.addSubshape(node, writer.endType);
      }
    }
  }

  for (const state of fsa.states) {
    const myType = getNodeTypeOfStateId(state.id);

    for (const [transition, target] of state.transitions) {
      const hisType = getNodeTypeOfStateId(target.id);

      const predicate = stringToTerm(transition.slice(1));
      const isPlus = transition[0] === "+";
      writer.addPath(
        isPlus ? myType : hisType,
        predicate as RDF.Quad_Predicate,
        isPlus ? hisType : myType,
        isPlus ? "subject" : "object"
      );
    }
  }

  return true;
}

export interface PathWriter {
  readonly startType: RDF.Term;
  readonly endType: RDF.Term | null;
  generateBlankType(): RDF.BlankNode
  
  addPath(subjectType: RDF.Term, predicate: RDF.Term, objectType: RDF.Term, knowing: 'subject' | 'object'): void;
  addSubshape(subshape: RDF.Term, supershape: RDF.Term): void;
};

function decompose(
  pathName: RDF.Term, shapeGraph: RDF.DatasetCore
): AC.AutomataComposer | null {
  const t = typeOfPathOf(pathName, shapeGraph);

  if (t === null) return null;

  switch(t.type) {
    case "Predicate":
      return AC.unit("+" + termToString(t.predicate));
    case "Inverse": {
      const original = decompose(t.pathName, shapeGraph);
      if (original === null) return null;
      return AC.modifyTransitions(original,
        symbol => {
          if (symbol[0] === "+") return "-" + symbol.slice(1);
          else return "+" + symbol.slice(1);
        }
      );
    }
    case "Alternative": {
      const paths = t.pathsName.map(name => decompose(name, shapeGraph));
      if (paths.includes(null)) return null;

      const paths_ = paths as AC.AutomataComposer[];

      return paths_.reduce(
        (acc, newElement) => AC.or(acc, newElement),
        new AC.AutomataComposer(0, 1, [])
      );
    }
    case "Sequence": {
      const paths = t.pathsName.map(name => decompose(name, shapeGraph));
      if (paths.includes(null)) return null;
      return AC.chain(...paths as AC.AutomataComposer[]);
    }
    case "ZeroOrOne": {
      const original = decompose(t.pathName, shapeGraph);
      if (original === null) return null;
      return AC.maybe(original);
    }
    case "OneOrMore": {
      const original = decompose(t.pathName, shapeGraph);
      if (original === null) return null;
      return AC.plus(original);
    }
    case "ZeroOrMore": {
      const original = decompose(t.pathName, shapeGraph);
      if (original === null) return null;
      return AC.star(original);
    }
    default:
      return null;
  }
}




///////////////////////////////////////////////////////////////////////////////

type PathType =
  null
  | { type: "Predicate", predicate: RDF.NamedNode }
  | { type: "Sequence", pathsName: RDF.Term[] }
  | { type: "Alternative", pathsName: RDF.Term[] }
  | { type: "ZeroOrOne", pathName: RDF.Term }
  | { type: "ZeroOrMore", pathName: RDF.Term }
  | { type: "OneOrMore", pathName: RDF.Term }
  | { type: "Inverse", pathName: RDF.Term };


function typeOfPathOf(
  pathName: RDF.Term,
  shapeGraph: RDF.DatasetCore
): null | PathType {
  const list = extractList(pathName, shapeGraph);
  if (list !== null) {
    return { type: "Sequence", pathsName: list };
  }

  const asSubject = shapeGraph.match(pathName, null, null, null);

  if (asSubject.size === 1) {
    const theQuad = [...asSubject][0];

    if (theQuad.predicate.equals(ns.sh.alternativePath)) {
      const alternativeList = extractList(theQuad.object, shapeGraph);
      if (alternativeList === null) return null;
      return { type: "Alternative", pathsName: alternativeList };
    } else if (theQuad.predicate.equals(ns.sh.inversePath)) {
      return { type: "Inverse", pathName: theQuad.object };
    } else if (theQuad.predicate.equals(ns.sh.zeroOrMorePath)) {
      return { type: "ZeroOrMore", pathName: theQuad.object }
    } else if (theQuad.predicate.equals(ns.sh.zeroOrOnePath)) {
      return { type: "ZeroOrOne", pathName: theQuad.object };
    } else if (theQuad.predicate.equals(ns.sh.oneOrMorePath)) {
      return { type: "OneOrMore", pathName: theQuad.object };
    }
  }

  if (pathName.termType === "NamedNode") {
    return { type: "Predicate", predicate: pathName };
  }

  return null;
}


function extractList(target: RDF.Term, dataset: RDF.DatasetCore) {
  let explored = new TermSet();

  let result: RDF.Term[] = [];

  while (!target.equals(ns.rdf.nil)) {
    if (explored.has(target)) return null;
    explored.add(target);

    let first = dataset.match(target, ns.rdf.first, null);
    let rest = dataset.match(target, ns.rdf.rest, null);

    if (first.size !== 1 || rest.size !== 1) return null;

    result.push([...first][0].object);
    target = [...rest][0].object;
  }

  return result;
}

