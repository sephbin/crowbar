// Extract the GURPS PDFs in rules/ into one text file per book page, for grepping while writing descriptions.
// Usage (from bellcurve/): node tools/extract_rules.mjs
// Needs pdftotext (MiKTeX or poppler). rules/ is gitignored: the books are copyrighted, so nothing extracted is committed.
// Copy the PDFs from \\sanguinecrow\Andrew\GURPS\GURPS 4e first.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// book prefix as used in page references, PDF file, and book page = PDF page + offset
const BOOKS = [
  ["B", "Basic Set - Characters.pdf", -2],
  ["B", "Basic Set - Campaigns.pdf", 335],
  ["M", "Magic.pdf", -2],
];
const dir = "rules", out = path.join(dir, "pages");
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const [prefix, file, offset] of BOOKS) {
  const pdf = path.join(dir, file);
  if (!fs.existsSync(pdf)) { console.error(`missing ${pdf}`); process.exitCode = 1; continue; }
  const txt = path.join(dir, file.replace(/\.pdf$/, ".txt"));
  execFileSync("pdftotext", ["-enc", "UTF-8", pdf, txt]);
  const pages = fs.readFileSync(txt, "utf8").split("\f");
  pages.forEach((t, i) => {
    const page = i + 1 + offset;
    if (page < 1 || !t.trim()) return;
    fs.writeFileSync(path.join(out, `${prefix}${String(page).padStart(3, "0")}.txt`), t);
    n++;
  });
}
console.log(`wrote ${n} pages to ${out}`);
