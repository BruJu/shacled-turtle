import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";

/**
 * Get the set at the given key
 * @param map The map
 * @param key The key
 * @returns The set at map[key]. If none is present, a new one is
 * created and returned.
 */
export function getWithDefaultInTermMultiMap(
  map: TermMap<RDF.Term, TermSet>, key: RDF.Term
): TermSet {
  let set = map.get(key);
  if (set !== undefined) return set;

  set = new TermSet();
  map.set(key, set);
  return set;
}

export function getWithDefault<V>(
  map: TermMap<RDF.Term, V>, key: RDF.Term,
  initializer: () => V
) {
  let elem = map.get(key);
  if (elem !== undefined) return elem;

  elem = initializer();
  map.set(key, elem);
  return elem;
}

export function addTermPairInTermMultiMap(
  map: TermMap<RDF.Term, TermSet>, key: RDF.Term, value: RDF.Term
) {
  getWithDefaultInTermMultiMap(map, key).add(value);
}
