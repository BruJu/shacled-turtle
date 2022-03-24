import TermMap from "@rdfjs/term-map";
import TermSet from "@rdfjs/term-set";
import * as RDF from "@rdfjs/types";

/**
 * Get the value at key in the given map. If no value is found, adds a default
 * value to the map and return it.
 * @param map The map
 * @param key The key
 * @param initializer A generator for the default value
 * @returns The value in the map at location key
 */
export function getWithDefault<K, V>(
  map: Map<K, V>, key: K, initializer: () => V
) {
  let elem = map.get(key);
  if (elem !== undefined) return elem;

  elem = initializer();
  map.set(key, elem);
  return elem;
}

/**
 * Adds the given value in the set located at map[key]. If no sets are present,
 * adds one.
 * @param map The multimap
 * @param key The key
 * @param value The value
 * @returns map
 */
export function addTermPairInTermMultiMap(
  map: TermMap<RDF.Term, TermSet>, key: RDF.Term, value: RDF.Term
): TermMap<RDF.Term, TermSet> {
  getWithDefault(map, key, newTermSet).add(value);
  return map;
}

function newTermSet() { return new TermSet(); }
