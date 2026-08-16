import { lemmaShard, normalizeLatin, prefixShard } from "./normalize.js";
import type {
  AnalysisResult,
  AnalyzerDataSource,
  AnalyzerManifest,
  CompactIrregular,
  CompactRadical,
  CoreData,
  LemmaRecord,
  MorphologicalAnalysis,
} from "./types.js";

type RawCandidate = {
  lemmaId: string;
  morphologyId: number;
  stem: string | null;
  ending: string | null;
  source: MorphologicalAnalysis["source"];
};

const ROMAN_NUMERAL = /^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

export class CollatinusAnalyzer {
  private manifestPromise?: Promise<AnalyzerManifest>;
  private corePromise?: Promise<CoreData>;
  private radicalShards = new Map<string, Promise<Record<string, CompactRadical[]>>>();
  private irregularShards = new Map<string, Promise<Record<string, CompactIrregular[]>>>();
  private lemmaShards = new Map<number, Promise<Record<string, LemmaRecord>>>();

  constructor(private readonly source: AnalyzerDataSource) {}

  private manifest(): Promise<AnalyzerManifest> {
    return (this.manifestPromise ??= this.source.loadManifest());
  }

  private async core(): Promise<CoreData> {
    if (!this.corePromise) {
      this.corePromise = this.manifest().then((manifest) => this.source.loadCore(manifest.files.core));
    }
    return this.corePromise;
  }

  private async loadRadicals(shard: string): Promise<Record<string, CompactRadical[]>> {
    let promise = this.radicalShards.get(shard);
    if (!promise) {
      promise = this.manifest().then((manifest) =>
        manifest.files.radicalShards.includes(shard)
          ? this.source.loadRadicalShard(shard)
          : {},
      );
      this.radicalShards.set(shard, promise);
    }
    return promise;
  }

  private async loadIrregulars(shard: string): Promise<Record<string, CompactIrregular[]>> {
    let promise = this.irregularShards.get(shard);
    if (!promise) {
      promise = this.manifest().then((manifest) =>
        manifest.files.irregularShards.includes(shard)
          ? this.source.loadIrregularShard(shard)
          : {},
      );
      this.irregularShards.set(shard, promise);
    }
    return promise;
  }

  private async lemma(lemmaId: string): Promise<LemmaRecord | undefined> {
    const manifest = await this.manifest();
    const shard = lemmaShard(lemmaId, manifest.files.lemmaShards);
    let promise = this.lemmaShards.get(shard);
    if (!promise) {
      promise = this.source.loadLemmaShard(shard);
      this.lemmaShards.set(shard, promise);
    }
    return (await promise)[lemmaId];
  }

  private async radicalsFor(value: string): Promise<CompactRadical[]> {
    const shard = await this.loadRadicals(prefixShard(value));
    return shard[value] ?? [];
  }

  private async irregularsFor(value: string): Promise<CompactIrregular[]> {
    const shard = await this.loadIrregulars(prefixShard(value));
    return shard[value] ?? [];
  }

  private async analyzeExact(form: string): Promise<RawCandidate[]> {
    const core = await this.core();
    const results: RawCandidate[] = [];

    for (const [lemmaId, morphologyId] of await this.irregularsFor(form)) {
      results.push({ lemmaId, morphologyId, stem: null, ending: null, source: "irregular" });
    }

    for (let index = 0; index <= form.length; index += 1) {
      const stemText = form.slice(0, index);
      const endingText = form.slice(index);
      const endings = core.endings[endingText];
      if (!endings?.length) continue;

      const radicals = [...await this.radicalsFor(stemText)];
      if (endingText.startsWith("i") && !endingText.startsWith("ii") && !stemText.endsWith("i")) {
        radicals.push(...await this.radicalsFor(`${stemText}i`));
      }

      for (const [lemmaId, radicalNumber, model, excluded = []] of radicals) {
        for (const [endingModel, endingRadicalNumber, morphologyId] of endings) {
          if (
            model === endingModel &&
            radicalNumber === endingRadicalNumber &&
            !excluded.includes(morphologyId)
          ) {
            results.push({
              lemmaId,
              morphologyId,
              stem: stemText,
              ending: endingText,
              source: "regular",
            });
          }
        }
      }
    }
    return results;
  }

  private variants(form: string, core: CoreData): string[] {
    const variants = new Set([form]);
    for (const [from, to] of Object.entries(core.assimilations)) {
      if (form.startsWith(from)) variants.add(to + form.slice(from.length));
      if (form.startsWith(to)) variants.add(from + form.slice(to.length));
    }
    for (const [contracted, expanded] of Object.entries(core.contractions)) {
      if (form.endsWith(contracted)) {
        variants.add(form.slice(0, -contracted.length) + normalizeLatin(expanded));
      }
    }
    for (const suffix of core.suffixes) {
      if (form.endsWith(suffix) && form !== suffix) variants.add(form.slice(0, -suffix.length));
    }
    return [...variants];
  }

  async analyze(surface: string): Promise<AnalysisResult> {
    const normalized = normalizeLatin(surface);
    if (!normalized) {
      return { surface, normalized, recognized: false, analysisCount: 0, lemmas: [] };
    }

    if (ROMAN_NUMERAL.test(surface)) {
      return {
        surface,
        normalized,
        recognized: true,
        analysisCount: 1,
        lemmas: [{
          id: normalized,
          headword: surface.toUpperCase(),
          quantitative: surface.toUpperCase(),
          dictionaryHeadword: surface.toUpperCase(),
          partOfSpeech: "numeral",
          gender: "",
          model: "inv",
          frequency: 0,
          dictionary: [],
          analyses: [{
            morphologyId: -1,
            morphology: "Roman numeral",
            stem: null,
            ending: null,
            source: "roman-numeral",
          }],
        }],
      };
    }

    const core = await this.core();
    const raw = (await Promise.all(this.variants(normalized, core).map((value) => this.analyzeExact(value)))).flat();
    const seen = new Set<string>();
    const grouped = new Map<string, { lemma: LemmaRecord; analyses: MorphologicalAnalysis[] }>();

    for (const candidate of raw) {
      const signature = `${candidate.lemmaId}|${candidate.morphologyId}|${candidate.stem ?? ""}|${candidate.ending ?? ""}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const lemma = await this.lemma(candidate.lemmaId);
      if (!lemma) continue;
      const group = grouped.get(candidate.lemmaId) ?? { lemma, analyses: [] };
      group.analyses.push({
        morphologyId: candidate.morphologyId,
        morphology: core.morphologies[String(candidate.morphologyId)] ?? `morphology ${candidate.morphologyId}`,
        stem: candidate.stem,
        ending: candidate.ending,
        source: candidate.source,
      });
      grouped.set(candidate.lemmaId, group);
    }

    const lemmas = [...grouped.values()]
      .sort((a, b) => b.lemma.frequency - a.lemma.frequency || a.lemma.headword.localeCompare(b.lemma.headword))
      .map(({ lemma, analyses }) => ({ ...lemma, analyses }));
    return {
      surface,
      normalized,
      recognized: lemmas.length > 0,
      analysisCount: lemmas.reduce((sum, lemma) => sum + lemma.analyses.length, 0),
      lemmas,
    };
  }

  async analyzeMany(forms: Iterable<string>): Promise<Record<string, AnalysisResult>> {
    const unique = [...new Set([...forms].map((form) => form.trim()).filter(Boolean))];
    const entries = await Promise.all(unique.map(async (form) => [normalizeLatin(form), await this.analyze(form)] as const));
    return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
  }
}
