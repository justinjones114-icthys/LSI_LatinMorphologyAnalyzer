import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CollatinusAnalyzer } from "../src/analyzer.js";
import { FileSystemDataSource } from "../src/node-loader.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/data");
const analyzer = new CollatinusAnalyzer(new FileSystemDataSource(root));

test("analyzes irregular sum forms with dictionary principal parts", async () => {
  const result = await analyzer.analyze("erat");
  assert.equal(result.recognized, true);
  const sum = result.lemmas.find((lemma) => lemma.id === "sum");
  assert.ok(sum);
  assert.equal(sum.dictionaryHeadword, "sum, esse, fui, futurus");
  assert.ok(sum.analyses.some((analysis) => analysis.morphology === "imperfect indicative active 3rd singular"));
});

test("preserves ambiguous regular analyses", async () => {
  const result = await analyzer.analyze("principio");
  assert.deepEqual(
    result.lemmas.flatMap((lemma) => lemma.analyses.map((analysis) => `${lemma.id}:${analysis.morphology}`)),
    [
      "principium:dative singular",
      "principium:ablative singular",
      "principio:present indicative active 1st singular",
    ],
  );
});

test("normalizes Vulgate orthography and retains all gratiae readings", async () => {
  const result = await analyzer.analyze("gratiæ");
  assert.ok(result.analysisCount >= 8);
  const grace = result.lemmas.find((lemma) => lemma.id.toLowerCase() === "gratia");
  assert.ok(grace);
  assert.ok(grace.analyses.some((analysis) => analysis.morphology === "genitive singular"));
  assert.ok(grace.analyses.some((analysis) => analysis.morphology === "dative singular"));
  assert.ok(grace.analyses.some((analysis) => analysis.morphology === "nominative plural"));
});

test("analyzes regular perfect verbs", async () => {
  const result = await analyzer.analyze("amavit");
  const amo = result.lemmas.find((lemma) => lemma.id === "amo");
  assert.ok(amo);
  assert.equal(amo.dictionaryHeadword, "amo, amare, amavi, amatus");
  assert.ok(amo.analyses.some((analysis) => analysis.morphology === "perfect indicative active 3rd singular"));
});

test("analyzes many forms into a normalized static index", async () => {
  const index = await analyzer.analyzeMany(["Erat", "principio", "erat"]);
  assert.deepEqual(Object.keys(index), ["erat", "principio"]);
});
