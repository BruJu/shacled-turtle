import * as RDF from '@rdfjs/types';
import TermMap from '@rdfjs/term-map';
import TermSet from '@rdfjs/term-set';
import { SuggestableType } from '../SuggestionDatabase';

export type StateData<MetaData> = {
  isSuggestible: boolean;
  metaData: MetaData;
}

type EpsTransition<MetaData> = {
  symbol: RDF.Term | null;
  next: RDF.Term;
  metaData: MetaData;
};

function equalsTransition<MetaData>(t1: EpsTransition<MetaData>, t2: EpsTransition<MetaData>): boolean {
  if (t1.symbol === null && t2.symbol !== null) return false;
  if (t1.symbol !== null && t2.symbol === null) return false;
  if (t1.symbol !== null && t2.symbol !== null) {
    if (!t1.symbol.equals(t2.symbol)) {
      return false;
    }
  }
  
  return t1.next.equals(t2.next);
}

export type State = TermSet;

export class RDFAutomataBuilder<MetaData> {
  metaDataInitializer: () => MetaData;
  states: TermMap<RDF.Term, StateData<MetaData>> = new TermMap();
  transitions: Map<RDF.Term, EpsTransition<MetaData>[]> = new TermMap();

  constructor(metaDataInitializer: () => MetaData) {
    this.metaDataInitializer = metaDataInitializer;
  }

  addState(term: RDF.Term): StateData<MetaData> {
    let data = this.states.get(term);
    if (data !== undefined) return data;

    data = {
      isSuggestible: false,
      metaData: this.metaDataInitializer()
    };
    this.states.set(term, data);
    this.transitions.set(term, []);
    return data;
  }

  addTransition(from: RDF.Term, to: RDF.Term, using: RDF.Term | null): MetaData {
    this.addState(from);
    this.addState(to);
    const transitions = this.transitions.get(from)!;

    const newTransition: EpsTransition<MetaData> = {
      symbol: using,
      next: to,
      metaData: this.metaDataInitializer()
    };

    const t = transitions.find(trans => equalsTransition(trans, newTransition));
    if (t === undefined) {
      transitions.push(newTransition);
      return newTransition.metaData;
    } else {
      return t.metaData;
    }
  }

  build(metadataMerger: (accumulator: MetaData, newData: MetaData) => void)
  : { automata: RDFAutomata<MetaData>, types: OntologyTypes<MetaData> } {
    let inner: AutomataNodes<MetaData> = new TermMap();
    let types: OntologyTypes<MetaData> = new TermMap();

    for (const [node, thisNodeMetaData] of this.states) {
      let automataTransitions: AutomataTransitions<MetaData> = new TermMap();

      let leftToVisit: RDF.Term[] = [node];
      let visited = new TermSet();
      visited.add(node);

      while (true) {
        const node = leftToVisit.shift();
        if (node === undefined) break;

        const transitions = this.transitions.get(node);
        if (transitions === undefined) continue;

        for (const { symbol, next, metaData } of transitions) {
          if (symbol === null) {
            if (!visited.has(next)) {
              visited.add(next);
              leftToVisit.push(next);
            }
          } else {
            let x = automataTransitions.get(symbol);
            if (x === undefined) {
              x = {
                data: metaData,
                destination: new TermSet([next])
              };
              automataTransitions.set(symbol, x);
            } else {
              metadataMerger(x.data, metaData);
              x.destination.add(next);
            }
          }
        }
      }

      inner.set(node, automataTransitions);

      if (thisNodeMetaData.isSuggestible) {
        types.set(node, thisNodeMetaData.metaData);
      }
    }

    return { automata: new RDFAutomata(inner), types: types };
  }
}

type AutomataNodes<MetaData> = TermMap<RDF.Term, AutomataTransitions<MetaData>>
type AutomataTransitions<MetaData> = TermMap<RDF.Term, AutomataDestination<MetaData>>;
type AutomataDestination<MetaData> = {
  data: MetaData;
  destination: TermSet
}

type OntologyTypes<MetaData> = TermMap<RDF.Term, MetaData>;

export default class RDFAutomata<MetaData> {
  inner: AutomataNodes<MetaData>;

  constructor(automataInner: AutomataNodes<MetaData>) {
    this.inner = automataInner;
  }
  
  getAllTypes(): SuggestableType[] {
    return [...this.inner.keys()]
    .map(term => ({ class: term, info: {} }) );
  }

  trimState(state: State) {
    const nodes = [...state];
    for (const node of nodes) {
      if (!this.inner.has(node)) {
        state.delete(node);
      }
    }
  }

  getPossiblePaths(state: State): TermMap<RDF.Term, MetaData> {
    let result = new TermMap();

    console.log(this.inner);

    for (const node of state) {
      const transitions = this.inner.get(node);
      if (transitions === undefined) continue;

      for (const [predicate, destination] of transitions) {
        result.set(predicate, destination.data);
      }
    }

    return result;
  }

  getNextState(state: State, path: RDF.Term): State {
    let result = new TermSet();

    for (const node of state) {
      const nextNodes = this.inner.get(node)?.get(path);
      if (nextNodes === undefined) continue;

      for (const nextNode of nextNodes.destination) {
        result.add(nextNode);
      }
    }

    return result;
  }
}
