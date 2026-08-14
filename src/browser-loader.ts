import type {
  AnalyzerDataSource,
  AnalyzerManifest,
  CompactIrregular,
  CompactRadical,
  CoreData,
  LemmaRecord,
} from "./types.js";

export class FetchDataSource implements AnalyzerDataSource {
  constructor(private readonly root: string) {}

  private async json<T>(relative: string): Promise<T> {
    const response = await fetch(`${this.root.replace(/\/$/, "")}/${relative}`);
    if (!response.ok) throw new Error(`Unable to load analyzer data: ${relative}`);
    return response.json() as Promise<T>;
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
