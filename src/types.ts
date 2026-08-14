export type CompactEnding = [model: string, radicalNumber: number, morphologyId: number];
export type CompactRadical = [
  lemmaId: string,
  radicalNumber: number,
  model: string,
  excludedMorphologies?: number[],
];
export type CompactIrregular = [lemmaId: string, morphologyId: number];

export type LemmaRecord = {
  id: string;
  headword: string;
  quantitative: string;
  dictionaryHeadword: string;
  partOfSpeech: string;
  model: string;
  frequency: number;
  dictionary: string[];
};

export type CoreData = {
  morphologies: Record<string, string>;
  endings: Record<string, CompactEnding[]>;
  assimilations: Record<string, string>;
  contractions: Record<string, string>;
  suffixes: string[];
};

export type AnalyzerManifest = {
  schemaVersion: number;
  collatinusCommit: string;
  generatedAt: string;
  counts: {
    lemmas: number;
    radicals: number;
    endings: number;
    irregularForms: number;
  };
  files: {
    core: string;
    radicalShards: string[];
    irregularShards: string[];
    lemmaShards: number;
  };
};

export type MorphologicalAnalysis = {
  morphologyId: number;
  morphology: string;
  stem: string | null;
  ending: string | null;
  source: "regular" | "irregular" | "roman-numeral";
};

export type AnalyzedLemma = LemmaRecord & {
  analyses: MorphologicalAnalysis[];
};

export type AnalysisResult = {
  surface: string;
  normalized: string;
  recognized: boolean;
  analysisCount: number;
  lemmas: AnalyzedLemma[];
};

export interface AnalyzerDataSource {
  loadManifest(): Promise<AnalyzerManifest>;
  loadCore(path: string): Promise<CoreData>;
  loadRadicalShard(shard: string): Promise<Record<string, CompactRadical[]>>;
  loadIrregularShard(shard: string): Promise<Record<string, CompactIrregular[]>>;
  loadLemmaShard(shard: number): Promise<Record<string, LemmaRecord>>;
}
