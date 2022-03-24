import * as StUtil from "../src/util";
import * as RDF from "@rdfjs/types";
import * as TestUtils from "./utility";
import TermSet from "@rdfjs/term-set";
import TermMap from "@rdfjs/term-map";
import assert from "assert";
import rdfNamespace from "@rdfjs/namespace";

const ex = rdfNamespace('http://example.org');

describe("util", () => {
  describe("getWithDefault", () => {
    it('should be a function', () => {
      assert.strictEqual(typeof StUtil.getWithDefault, 'function');
    });

    it('should return the default value is no value has been found', () => {
      const numberMap = new Map<number, number>();
      assert.strictEqual(StUtil.getWithDefault(numberMap, 7, () => 2), 2);
      assert.strictEqual(StUtil.getWithDefault(numberMap, 5, () => 2), 2);
      assert.strictEqual(StUtil.getWithDefault(numberMap, 7, () => 8), 2);
      assert.strictEqual(StUtil.getWithDefault(numberMap, 77, () => 8), 8);
    });
  });

  describe('addTermPairInTermMultiMap', () => {
    it('should be a function', () => {
      assert.strictEqual(typeof StUtil.addTermPairInTermMultiMap, 'function');
    });

    it('should work', () => {
      const m = new TermMap<RDF.Term, TermSet>();

      assert.strictEqual(m.size, 0);

      StUtil.addTermPairInTermMultiMap(m, ex.class1, ex.value11);

      assert.strictEqual(m.size, 1);
      TestUtils.assertSame(m.get(ex.class1)!, [ex.value11]);
      assert.strictEqual(m.get(ex.class2), undefined);

      StUtil.addTermPairInTermMultiMap(m, ex.class2, ex.value2);
      TestUtils.assertSame(m.get(ex.class2)!, [ex.value2]);

      StUtil.addTermPairInTermMultiMap(m, ex.class1, ex.value12);
      TestUtils.assertSame(m.get(ex.class1)!, [ex.value11, ex.value12]);
      TestUtils.assertSame(m.get(ex.class2)!, [ex.value2]);
    });
  });
});
