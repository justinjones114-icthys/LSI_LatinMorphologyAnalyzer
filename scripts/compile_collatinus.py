#!/usr/bin/env python3
"""Compile Collatinus into deterministic, browser-loadable analyzer shards."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from pycollatinus import Lemmatiseur
from pycollatinus.parser import Parser


POS_LABELS = {
    "a": "adjective",
    "c": "conjunction",
    "d": "adverb",
    "e": "interjection",
    "i": "indeclinable",
    "m": "numeral",
    "n": "noun",
    "p": "pronoun",
    "r": "preposition",
    "v": "verb",
}
LEMMA_SHARDS = 64


def stable_json(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(stable_json(value), encoding="utf-8")


def load_morphologies(path: Path) -> dict[int, str]:
    result = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("!") and ":" in line:
            key, label = line.split(":", 1)
            result[int(key)] = label
    return result


def load_translations(path: Path) -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("!") or ":" not in line:
            continue
        key, definition = line.split(":", 1)
        definition = " ".join(definition.split()).strip(" ;")
        if definition and definition not in result[key]:
            result[key].append(definition)
    return dict(result)


def definitions(lemma_id: str, headword: str, translations: dict[str, list[str]]) -> list[str]:
    exact_candidates = (
        lemma_id,
        headword,
        lemma_id.lower(),
        headword.lower(),
        re.sub(r"\d+$", "", lemma_id),
    )

    def collect(candidates) -> list[str]:
        found = []
        for candidate in candidates:
            for definition in translations.get(candidate, []):
                if definition not in found:
                    found.append(definition)
        return found

    found = collect(exact_candidates)
    if found:
        return found[:2]

    orthographic_candidates = []
    for candidate in exact_candidates:
        for variant in (
            candidate.replace("u", "v").replace("U", "V"),
            candidate.replace("i", "j").replace("I", "J"),
            candidate.replace("u", "v").replace("U", "V").replace("i", "j").replace("I", "J"),
        ):
            if variant != candidate and variant not in orthographic_candidates:
                orthographic_candidates.append(variant)

    found = collect(orthographic_candidates)
    return found[:2]


def prepare_collatinus(data_dir: Path) -> Lemmatiseur:
    staging = Path(tempfile.mkdtemp(prefix="lingua-analyzer-collatinus-"))
    for source in data_dir.glob("*.la"):
        destination = staging / source.name
        if source.name == "modeles.la":
            lines = source.read_text(encoding="utf-8").splitlines()
            destination.write_text(
                "\n".join(line for line in lines if not line.startswith("nbr:")) + "\n",
                encoding="utf-8",
            )
        else:
            shutil.copyfile(source, destination)
    for source in data_dir.glob("morphos.*"):
        shutil.copyfile(source, staging / source.name)

    analyzer = Lemmatiseur(load=False)
    analyzer._resDir = str(staging)
    Parser(analyzer, path=str(staging), cible="fr").parse()
    analyzer._morphos["fr"] = load_morphologies(data_dir / "morphos.en")
    return analyzer


def generated_form(lemma, morphology_ids: tuple[int, ...]) -> str | None:
    for morphology_id in morphology_ids:
        for ending in lemma.modele().desinences(morphology_id):
            for stem in lemma.radical(ending.numRad()):
                return f"{stem.gr()}{ending.gr()}"
    return None


def dictionary_headword(lemma) -> str:
    if lemma.pos() != "v":
        return lemma.grq() or lemma.gr()
    parts = [
        lemma.gr(),
        generated_form(lemma, (187, 302)),
        generated_form(lemma, (139,)),
        generated_form(lemma, (303, 225)),
    ]
    return ", ".join(part for index, part in enumerate(parts) if part and part not in parts[:index])


def prefix_shard(value: str) -> str:
    if not value:
        return "empty"
    first = value[0] if value[0].isascii() and value[0].isalpha() else "_"
    second = value[1] if len(value) > 1 and value[1].isascii() and value[1].isalpha() else "_"
    return f"{first}{second}"


def fnv1a(value: str) -> int:
    result = 0x811C9DC5
    for char in value:
        result ^= ord(char)
        result = (result * 0x01000193) & 0xFFFFFFFF
    return result


def commit(root: Path) -> str:
    return subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--collatinus-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    data_dir = args.collatinus_root / "bin" / "data"
    analyzer = prepare_collatinus(data_dir)
    translations: dict[str, list[str]] = {}
    for filename in ("lemmes.en", "lem_ext.en"):
        for key, values in load_translations(data_dir / filename).items():
            translations.setdefault(key, []).extend(
                value for value in values if value not in translations.get(key, [])
            )
    output = args.output.resolve()
    if output.exists():
        if output.name != "data":
            raise SystemExit(f"refusing to replace unexpected output directory: {output}")
        shutil.rmtree(output)
    output.mkdir(parents=True)

    lemmas = {}
    for lemma_id, lemma in sorted(analyzer._lemmes.items()):
        lemmas[lemma_id] = {
            "id": lemma_id,
            "headword": lemma.gr(),
            "quantitative": lemma.grq(),
            "dictionaryHeadword": dictionary_headword(lemma),
            "partOfSpeech": POS_LABELS.get(lemma.pos(), lemma.pos() or "unknown"),
            "model": lemma.grModele(),
            "frequency": lemma.nbOcc(),
            "dictionary": definitions(lemma_id, lemma.gr(), translations),
        }

    radical_buckets: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    radical_count = 0
    for radical_text, radicals in sorted(analyzer._radicaux.items()):
        seen = set()
        for radical in radicals:
            lemma = radical.lemme()
            value = (
                lemma.cle(),
                radical.numRad(),
                lemma.grModele(),
                tuple(sorted(lemma._morphosIrrExcl)),
            )
            if value in seen:
                continue
            seen.add(value)
            compact = [value[0], value[1], value[2]]
            if value[3]:
                compact.append(list(value[3]))
            radical_buckets[prefix_shard(radical_text)][radical_text].append(compact)
            radical_count += 1

    endings = {}
    ending_count = 0
    for ending_text, records in sorted(analyzer._desinences.items()):
        values = sorted({(record.modele().gr(), record.numRad(), record.morphoNum()) for record in records})
        endings[ending_text] = [list(value) for value in values]
        ending_count += len(values)

    irregular_buckets: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for form, records in sorted(analyzer._irregs.items()):
        seen = set()
        for irregular in records:
            for morphology_id in irregular.morphos():
                value = (irregular.lemme().cle(), morphology_id)
                if value in seen:
                    continue
                seen.add(value)
                irregular_buckets[prefix_shard(form)][form].append(list(value))

    core = {
        "morphologies": {str(key): value for key, value in sorted(analyzer._morphos["fr"].items())},
        "endings": endings,
        "assimilations": dict(sorted(analyzer._assimsq.items())),
        "contractions": dict(sorted(analyzer._contractions.items())),
        "suffixes": sorted(analyzer._suffixes),
    }
    write_json(output / "core.json", core)

    radical_shards = []
    for shard, mapping in sorted(radical_buckets.items()):
        radical_shards.append(shard)
        write_json(output / "radicals" / f"{shard}.json", mapping)

    irregular_shards = []
    for shard, mapping in sorted(irregular_buckets.items()):
        irregular_shards.append(shard)
        write_json(output / "irregulars" / f"{shard}.json", mapping)

    lemma_buckets = [dict() for _ in range(LEMMA_SHARDS)]
    for lemma_id, value in lemmas.items():
        lemma_buckets[fnv1a(lemma_id) % LEMMA_SHARDS][lemma_id] = value
    for index, bucket in enumerate(lemma_buckets):
        write_json(output / "lemmas" / f"{index:03d}.json", bucket)

    manifest = {
        "schemaVersion": 1,
        "collatinusCommit": commit(args.collatinus_root),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "lemmas": len(lemmas),
            "radicals": radical_count,
            "endings": ending_count,
            "irregularForms": sum(len(mapping) for mapping in irregular_buckets.values()),
        },
        "files": {
            "core": "core.json",
            "radicalShards": radical_shards,
            "irregularShards": irregular_shards,
            "lemmaShards": LEMMA_SHARDS,
        },
    }
    write_json(output / "manifest.json", manifest)
    print(stable_json(manifest).strip())


if __name__ == "__main__":
    main()
