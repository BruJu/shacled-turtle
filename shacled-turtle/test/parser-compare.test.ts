import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as n3 from "n3";
import { isomorphic } from "rdf-isomorphic";
import parseFullDocument from "../src/FullParser";

describe("Parsing compare", () => {
  const docs = fs.readdirSync(path.join(__dirname, "turtle-documents"));

  for (const docName of docs) {
    it(docName, async () => {
      const fullPath = path.join(__dirname, "turtle-documents", docName);
      const documentText = await fs.promises.readFile(fullPath, "utf-8");

      const byN3 = new n3.Parser().parse(documentText);
      const byST = parseFullDocument(documentText);

      assert.ok(isomorphic(byN3, byST));
    });
  }
});

