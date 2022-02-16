import * as RDF from "@rdfjs/types";
import TermSet from "@rdfjs/term-set";
import TermMap from "@rdfjs/term-map";
import { ns } from "../PRECNamespace";
import { DataFactory } from "n3";
import { addInTermMultiMap, addTermPairInTermMultiMap } from "../util";


export default function buildPath(
  pathName: RDF.Term,
  shapeGraph: RDF.DatasetCore,
  generator: Generator = new Generator()
): Path | null {
  const t = typeOfPathOf(pathName, shapeGraph);

  if (t === null) return null;

  switch(t.type) {
    case "Predicate": {
      const src = generator.next();
      const dest = generator.next();
  
      return NewPath.predicatePath(src, dest, t.predicate);
    }
    case "Inverse": {
      const original = buildPath(t.pathName, shapeGraph, generator);
      if (original === null) return null;
      return original.inverse();
    }
    case "Alternative": {
      const paths = t.pathsName.map(name => buildPath(name, shapeGraph, generator));
      if (paths.includes(null)) return null;
      return NewPath.alternative(paths as Path[], generator);
    }
    case "Sequence": {
      const paths = t.pathsName.map(name => buildPath(name, shapeGraph, generator));
      if (paths.includes(null)) return null;
      return NewPath.sequence(paths as Path[], generator);
    }
    case "ZeroOrOne":
    case "OneOrMore":
    case "ZeroOrMore": {
      const path = buildPath(t.pathName, shapeGraph, generator);
      if (path === null) return null;

      const source = generator.next();
      const intermediate = generator.next();
      const end = generator.next();

      const inh: TermMap<RDF.Term, TermSet> = new TermMap();

      if (t.type !== "OneOrMore") {
        addTermPairInTermMultiMap(inh, source, end);
      }

      addTermPairInTermMultiMap(inh, source, path.source);
      addTermPairInTermMultiMap(inh, path.destination, end); 

      if (t.type !== "ZeroOrOne") {
        addTermPairInTermMultiMap(inh, path.destination, intermediate);
        addTermPairInTermMultiMap(inh, intermediate, path.source);
      }

      return new Path(
        source,
        end,
        addInTermMultiMap(inh, path.inheritence),
        path.edges
      );
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

///////////////////////////////////////////////////////////////////////////////

function $quad(s: RDF.Term, p: RDF.Term, o: RDF.Term, g: RDF.Term) {
  return DataFactory.quad(
    s as RDF.Quad_Subject,
    p as RDF.Quad_Predicate,
    o as RDF.Quad_Object,
    g as RDF.Quad_Graph
  );
}

///////////////////////////////////////////////////////////////////////////////


export const NewPath = {
  emptyPath(generator: Generator): Path {
    return new Path(
      generator.next(),
      generator.next(),
      new TermMap(),
      []
    );
  },

  predicatePath(
    source: RDF.Term, destination: RDF.Term,
    predicate: RDF.NamedNode
  ): Path {
    return new Path(
      source, destination, new TermMap(),
      [$quad(source, predicate, destination, source)]
    );
  },

  alternative(paths: Path[], generator: Generator): Path {
    const source = generator.next();
    const destination = generator.next();

    const inh: TermMap<RDF.Term, TermSet> = new TermMap();

    for (const path of paths) {
      addTermPairInTermMultiMap(inh, source, path.source);
      addTermPairInTermMultiMap(inh, path.destination, destination);
      addInTermMultiMap(inh, path.inheritence);
    }

    return new Path(
      source, destination,
      inh,
      paths.flatMap(path => path.edges)
    )
  },

  sequence(paths: Path[], generator: Generator): Path {
    if (paths.length === 0) {
      const start = generator.next();
      const end = generator.next();
      return new Path(
        start,
        end,
        new TermMap([
          [start, new TermSet([end])]
        ]),
        []
      );
    }

    let result = paths[0];

    for (let i = 1; i != paths.length; ++i) {
      result = result.chain(paths[i]);
    }

    return result;
  }
};


export class Path {
  readonly source: RDF.Term;
  readonly destination: RDF.Term;
  readonly inheritence: TermMap<RDF.Term, TermSet>;
  readonly edges: RDF.Quad[];

  constructor(
    source: RDF.Term,
    destination: RDF.Term,
    inheritence: TermMap<RDF.Term, TermSet>,
    edges: RDF.Quad[]
  ) {
    this.source = source;
    this.destination = destination;
    this.inheritence = inheritence;
    this.edges = edges;
  }

  inverse(): Path {
    return new Path(
      this.source,
      this.destination,
      this.inheritence,
      this.edges.map(edge => $quad(edge.object, edge.predicate, edge.subject, edge.graph))
    );
  }

  chain(path: Path): Path {
    return new Path(
      this.source, path.destination,
      addTermPairInTermMultiMap(
        addInTermMultiMap(
          cloneTermMultiMap(this.inheritence),
          path.inheritence
        ),
        this.destination,
        path.source
      ),
      [...this.edges, ...path.edges]
    );
  }

  clone(): Path {
    return new Path(
      this.source,
      this.destination,
      cloneTermMultiMap(this.inheritence),
      [...this.edges]
    );
  }
}

function cloneTermMultiMap(map: TermMap<RDF.Term, TermSet>) {
  const clone: TermMap<RDF.Term, TermSet> = new TermMap();
  
  for (const [k, v] of map) {
    clone.set(k, new TermSet([...v]));
  }

  return clone;
}


class Generator {
  private nextId = 1;

  next(): RDF.Term {
    return DataFactory.literal(this.nextId++);
  }
}
