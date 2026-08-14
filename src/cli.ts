#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CollatinusAnalyzer } from "./analyzer.js";
import { FileSystemDataSource } from "./node-loader.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  const dataRoot = path.resolve(option("--data") ?? "public/data");
  const analyzer = new CollatinusAnalyzer(new FileSystemDataSource(dataRoot));

  if (command === "analyze") {
    const words = process.argv.slice(3).filter((value, index, values) => value !== "--data" && values[index - 1] !== "--data");
    if (!words.length) throw new Error("Usage: lingua-collatinus analyze <word...> [--data path]");
    const results = await Promise.all(words.map((word) => analyzer.analyze(word)));
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  if (command === "index") {
    const input = option("--input");
    const output = option("--output");
    if (!input || !output) throw new Error("Usage: lingua-collatinus index --input forms.txt --output index.json [--data path]");
    const forms = (await readFile(input, "utf8")).split(/\r?\n/);
    const index = await analyzer.analyzeMany(forms);
    await writeFile(output, `${JSON.stringify(index)}\n`, "utf8");
    process.stdout.write(`indexed ${Object.keys(index).length} forms\n`);
    return;
  }

  throw new Error("Commands: analyze, index");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
