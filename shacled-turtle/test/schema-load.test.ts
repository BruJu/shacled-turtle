import * as n3 from "n3";
import * as fs from "fs";
import * as path from "path";
import assert from 'assert';
import { parseDocument } from "..";

import checkIsomorphism from "@bruju/rdf-test-util";

describe("Parser comparaison", () => {
  it("paths-sechma.ttl", () => {
    const filename = path.join(__dirname, "autocompletion-documents", "paths-schema.ttl");
    const content = fs.readFileSync(filename, "utf8");

    const quads = parseDocument(content);

    const iso = checkIsomorphism(quads, new n3.Parser().parse(content));
    assert.ok(iso.areIsomorphic, iso.text)
  })
});
