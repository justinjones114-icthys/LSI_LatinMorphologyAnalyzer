import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AnalyzerDataSource,
  AnalyzerManifest,
  CompactIrregular,
  CompactRadical,
  CoreData,
  LemmaRecord,
} from "./types.js";

export class FileSystemDataSource implements AnalyzerDataSource {
  constructor(private readonly root: string) {}

  private async json<T>(relative: string): Promise<T> {
    return JSON.parse(await readFile(path.join(this.root, relative), "utf8")) as T;
  }

  loadManifest(): Promise<AnalyzerManifest> {
    return this.json("manifest.json");
  }

  loadCore(relative: string): Promise<CoreData> {
    return this.json(relative);
  }

  loadRadicalShard(shard: string): Promise<Record<string, CompactRadical[]>> {
    return this.json(`radicals/${shard}.json`);
  }

  loadIrregularShard(shard: string): Promise<Record<string, CompactIrregular[]>> {
    return this.json(`irregulars/${shard}.json`);
  }

  loadLemmaShard(shard: number): Promise<Record<string, LemmaRecord>> {
    return this.json(`lemmas/${String(shard).padStart(3, "0")}.json`);
  }
}
