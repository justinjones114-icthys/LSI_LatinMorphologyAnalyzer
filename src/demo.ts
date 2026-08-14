import { CollatinusAnalyzer } from "./analyzer.js";
import { FetchDataSource } from "./browser-loader.js";

const analyzer = new CollatinusAnalyzer(new FetchDataSource("/data"));
const form = document.querySelector<HTMLFormElement>("#lookup")!;
const input = document.querySelector<HTMLInputElement>("#word")!;
const result = document.querySelector<HTMLElement>("#result")!;

async function analyze() {
  result.textContent = "Analyzing…";
  result.textContent = JSON.stringify(await analyzer.analyze(input.value), null, 2);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void analyze();
});

void analyze();
