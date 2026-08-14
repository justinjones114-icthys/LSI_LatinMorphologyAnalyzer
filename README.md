# Lingua Sacra Collatinus Analyzer

A full Collatinus morphological analyzer for Node.js and modern browsers. The
runtime preserves every plausible analysis and performs no external API calls.

The compiler converts pinned Collatinus resources into compact shards:

- lemma metadata and dictionary principal parts;
- radical indexes;
- inflectional endings and English morphology labels;
- irregular forms;
- assimilation, contraction, and enclitic rules.

The runtime performs actual `stem + ending` analysis. It does not enumerate or
ship every theoretically possible Latin word.

## Build the analyzer data

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
git clone https://github.com/biblissima/collatinus.git .cache/collatinus
git -C .cache/collatinus checkout a0eb15bb0acc
.venv/bin/python scripts/compile_collatinus.py \
  --collatinus-root .cache/collatinus \
  --output public/data
```

## Use from Node

```ts
import { CollatinusAnalyzer, FileSystemDataSource } from "@lingua-sacra/collatinus-analyzer";

const analyzer = new CollatinusAnalyzer(new FileSystemDataSource("public/data"));
console.log(await analyzer.analyze("gratiæ"));
```

## Use in a browser

```ts
import { CollatinusAnalyzer, FetchDataSource } from "@lingua-sacra/collatinus-analyzer";

const analyzer = new CollatinusAnalyzer(new FetchDataSource("/collatinus-data"));
const result = await analyzer.analyze("principio");
```

## Build a static library index

```sh
npm run build
node dist/cli.js index --input forms.txt --output index.json --data public/data
```

This uses exactly the same analyzer as the live browser runtime, ensuring that
published library indexes and ad hoc lookups agree.
