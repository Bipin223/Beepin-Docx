# Beepin Docx — AI Question Paper → Clean Word + PDF

**Design:** warm minimalist caffeine theme — borderless tonal surfaces, Poppins, Lucide outline icons, gradient separators. Light/dark toggle uses a circular View-Transitions reveal; tabs use center-out underlines + hover wave; provider/model are custom tonal dropdowns with glass menus; Photo-to-AI is an expandable section.

Paste messy output from Gemini / ChatGPT / Groq → clean **A4 preview** → **proper .docx with native editable Word equations** + **PDF**.

Author: **Bipin Rizal** — https://github.com/Bipin223

## Run
`python server.py` → http://localhost:8000 (stdlib only, no install). The server holds API keys in memory and proxies AI calls — keys never touch the browser, logs, or errors.

## AI architecture
- `askAI({provider, model, messages, signal})` is the single frontend entry → `POST /api/ai`
- `POST /api/models` discovers key-available models (5-min server cache); verification tests exactly one candidate with a 25s cancellable probe — model names are never trusted blindly
- Provider settings: separate masked key inputs (explicit show/clear clicks), Discover, Test/Cancel, default-provider radio, manual chat-model selector
- Auto mode tries default-then-other (max 2 attempts), shows "Answered by X · model", warns about cross-provider quota; manual choice never falls through; refusals are never retried elsewhere
- Success normalizes to `{text, provider, model}`; errors to `{error, code}` with credentials scrubbed

## Author photo
Save the author photo as `author.jpg` next to `index.html` (fallback shows BR initials).

## Deploy to GitHub Pages
Push to repo → Settings → Pages → `main` / root, or use `.github/workflows/pages.yml`.

## Conversion coverage (the essence)
Every LaTeX construct becomes its proper Word form — verified against the `docx@8.5.0` OMML API, 13/13 engine checks green:
- `\frac`, `\dfrac`, `\binom`, `\sqrt[n]{}` → stacked fractions, n-th roots
- `^` / `_` (incl. `x^{2}`, `A^{-1}`) → true superscripts/subscripts
- `\sum`, `\int` + limits → native ∑ / ∫ with sub/superscripts; `\prod`, `\bigcup`… → proper large operators
- `\sin`, `\log`, `\lim`… → Word functions; `\lim_{x\to0}` keeps its limit
- `\hat`, `\vec`, `\dot`, `\overline`, `\cancel`, `\boxed` → accents/overlays/boxes
- Matrices (`pmatrix`…) → growing brackets; `cases` → clean 2-column layout; `align`/`\\` → separate display equations; `\tag{}` kept
- 100+ symbols: Greek, `× ÷ ± ≤ ≥ ≠ ∞ → ° ∂ ∇ ∀ ∃ …`
- Unknown commands are kept as literal text — nothing is ever silently dropped
- Toggle *Native Word equations* for plain-text fallback

## Edit in place (new)
- The A4 paper itself is editable: click it and type, delete, paste (pasted text is auto-cleaned to plain text)
- Format bar: **B** *I* <u>U</u>, ― horizontal line (exports as a real Word line), ⌫ clear formatting
- Marks show as plain right-margin text `[2 marks]` — no boxes. Formulas are locked while editing so they can't break
- **Exports use your edited version**: `.docx` keeps bold/italic/underline, tables, code, lines, and native equations; `.doc`/PDF mirror the preview

## Export
- **.docx** — real `.docx` (editable equations), **PDF** button, and a **More** menu: Print, **.doc**, **PowerPoint .pptx** (title slide + question slides; math as readable Unicode — PPTX has no equation objects), **Markdown .md**, standalone **.html**
- Fullscreen preview button (⛶) + A−/A+ zoom for a proper full-window read

## Photo → AI (new)
- **Take photo** (in-app camera modal, needs HTTPS/localhost + permission) or **Upload** (works everywhere)
- Photo is downscaled in-browser, then sent to Gemini (`gemini-1.5-flash` vision) or Groq (`meta-llama/llama-4-scout-17b-16e-instruct` vision) with your question
- Ask it to extract questions as Markdown + `$LaTeX$`, then **Send to editor** → Clean & Preview → export. Full chat-and-extract loop.
