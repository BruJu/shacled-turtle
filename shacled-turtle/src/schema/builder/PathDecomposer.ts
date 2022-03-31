import * as AC from "@bruju/automata-composer";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";
import { stringToTerm, termToString } from "rdf-string";
import { ns } from "../../namespaces";

// TODO: decide what to do when the a path is invalid. Currently, we return
// false and Shacled-Turtle silently ignores the fact that the path was invalid.
// Codelines that correspond to this are currently removed from coverage
// computation

/**
 * Read the path described by `pathName`, transform it into a sequence of
 * predicate path / inverse predicate path, ending with some empty path to
 * a unique shape.
 * @param pathName The name of the path
 * @param shapeGraph The shape graph
 * @param writer The object to get terms for the different states of the
 * automata
 * @returns The list of the transitions of the automata if the path is valid,
 * false if the path is invalid.
 */
export default function writePath(
  pathName: RDF.Term, shapeGraph: RDF.DatasetCore, writer: PathWriter
): { transitions: RDFAutomataTransition[], ends: TermSet<RDF.Term> } | false {
  // Convert path to finite state automata
  const composedAutomata = decompose(pathName, shapeGraph);
  /* istanbul ignore if */
  if (composedAutomata === null) return false;

  const pathAutomata = composedAutomata.build();

  let stateIdToTerm = new Map<number, RDF.Term>();
  function getNodeTypeOfStateId(id: number): RDF.Term {
    let r = stateIdToTerm.get(id);
    if (r === undefined) {
      r = writer.generateBlankType();
      stateIdToTerm.set(id, r);
    }
    return r;
  }

  stateIdToTerm.set(pathAutomata.start.id, writer.startType);

  let transitions: RDFAutomataTransition[] = [];

  if (writer.endType !== null) {
    for (const end of pathAutomata.ends) {
      const node = getNodeTypeOfStateId(end.id);
      transitions.push({
        type: "epsilon", from: node, to: writer.endType
      });
    }
  }

  for (const state of pathAutomata.states) {
    const myType = getNodeTypeOfStateId(state.id);

    for (const [transition, target] of state.transitions) {
      const hisType = getNodeTypeOfStateId(target.id);

      const predicate = stringToTerm(transition.slice(1));
      transitions.push({
        type: transition[0] as '+' | '-',
        predicate: predicate as RDF.NamedNode,
        from: myType,
        to: hisType
      });
    }
  }

  return {
    transitions: transitions,
    ends: new TermSet(pathAutomata.ends.map(g => getNodeTypeOfStateId(g.id)))
  };
}

export interface PathWriter {
  /** The type that corresponds to the initial state */
  readonly startType: RDF.Term;
  
  /**
   * The type that corresponds to the final state. Returns null if a new blank
   * type should be generated instead
   */
  readonly endType: RDF.Term | null;
  
  /** Generates a new blank node for a state */
  generateBlankType(): RDF.BlankNode
};

/** A transition in the automata */
export type RDFAutomataTransition = EpsilonTransition | OutcomingTransition | IncomingTransition;

/** Epsilon transition */
export type EpsilonTransition = { type: "epsilon", from: RDF.Term, to: RDF.Term };

/** Outcoming path = equivalent to predicate path */
export type OutcomingTransition = { type: "+", from: RDF.Term, predicate: RDF.NamedNode, to: RDF.Term };

/** Incoming path = equivalent to inverse predicate path */
export type IncomingTransition = { type: "-", from: RDF.Term, predicate: RDF.NamedNode, to: RDF.Term };

///////////////////////////////////////////////////////////////////////////////

/**
 * Transform the given path into an automata composer
 * @param pathName The name of the path
 * @param shapeGraph The shape graph
 * @returns The automata composer or null if its not a valid path
 */
function decompose(
  pathName: RDF.Term, shapeGraph: RDF.DatasetCore
): AC.AutomataComposer | null {
  const t = typeOfPathOf(pathName, shapeGraph);
  /* istanbul ignore if */
  if (t === null) return null;

  switch(t.type) {
    case "Predicate":
      return AC.unit("+" + termToString(t.predicate));
    case "Inverse": {
      const original = decompose(t.pathName, shapeGraph);
      /* istanbul ignore if */
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
      /* istanbul ignore if */
      if (paths.includes(null)) return null;

      const paths_ = paths as AC.AutomataComposer[];

      return paths_.reduce(
        (acc, newElement) => AC.or(acc, newElement),
        new AC.AutomataComposer(0, 1, [])
      );
    }
    case "Sequence": {
      const paths = t.pathsName.map(name => decompose(name, shapeGraph));
      /* istanbul ignore if */
      if (paths.includes(null)) return null;
      return AC.chain(...paths as AC.AutomataComposer[]);
    }
    case "ZeroOrOne": {
      const original = decompose(t.pathName, shapeGraph);
      /* istanbul ignore if */
      if (original === null) return null;
      return AC.maybe(original);
    }
    case "OneOrMore": {
      const original = decompose(t.pathName, shapeGraph);
      /* istanbul ignore if */
      if (original === null) return null;
      return AC.plus(original);
    }
    case "ZeroOrMore": {
      const original = decompose(t.pathName, shapeGraph);
      /* istanbul ignore if */
      if (original === null) return null;
      return AC.star(original);
    }
    default:
      /* istanbul ignore next */
      return null;
  }
}

/** List of existing kind of paths in SHACL */
type PathType =
  null
  | { type: "Predicate", predicate: RDF.NamedNode }
  | { type: "Sequence", pathsName: RDF.Term[] }
  | { type: "Alternative", pathsName: RDF.Term[] }
  | { type: "ZeroOrOne", pathName: RDF.Term }
  | { type: "ZeroOrMore", pathName: RDF.Term }
  | { type: "OneOrMore", pathName: RDF.Term }
  | { type: "Inverse", pathName: RDF.Term };


/** Extract the kind of path of pathName in the given shape graph */
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
      /* istanbul ignore if */
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

  /* istanbul ignore next */
  return null;
}

/** Extract the RDF list whose head is target from the dataset */
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
