# AI Discoverability Frameworks

BaseMind implements six complementary discoverability disciplines so both classic search engines and AI answer engines understand and cite the product correctly.

## The six frameworks
| # | Framework | What it optimizes for | Implemented via |
|---|---|---|---|
| 1 | **SEO** — Search Engine Optimization | Google/Bing rankings | metadata, sitemap.xml, robots.txt, semantic HTML, performance |
| 2 | **AEO** — Answer Engine Optimization | featured snippets / direct answers | concise factual description blocks, FAQ-style phrasing, structured data |
| 3 | **GEO** — Generative Engine Optimization | citations inside AI-generated answers | quotable product summary, clear entity relationships (JSON-LD `@graph`) |
| 4 | **LLMO** — LLM Optimization | being understood by LLMs | `public/llms.txt`, explicit AI-crawler permissions in robots.txt |
| 5 | **AISEO / AI Search Optimization** | AI search surfaces (SGE, Perplexity) | combined effect of 1–4 plus fast, crawlable public pages |
| 6 | **E-E-A-T** — Experience, Expertise, Authoritativeness, Trust | quality signals | consistent author identity, Person/Organization schema, verifiable sameAs links |

## Files that implement this
| file | purpose |
|---|---|
| `src/app/layout.tsx` | full Metadata block (title template, description, keywords, OpenGraph, Twitter, robots) + JSON-LD `@graph` with Organization, Person, WebSite nodes |
| `src/app/robots.ts` | allows AI crawlers explicitly (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot…), blocks private app routes |
| `src/app/sitemap.ts` | lists public pages (`/`, `/login`, `/signup`) |
| `public/llms.txt` | markdown brief of what BaseMind is/does for LLM ingestion |

## Canonical author identity (use EXACTLY this everywhere)
```
Shivam Singh — Founder & Full-Stack Engineer at BaseMind
https://github.com/shivamsingh7533
```
Rule: title, spelling, and URL must match character-for-character across GitHub profile, LinkedIn, the website JSON-LD, llms.txt, and any guest posts — inconsistent identities split E-E-A-T signals across entities.

## Search Console & Bing Webmaster submission
1. Google Search Console → add property `base-mind.vercel.app` → verify (HTML tag or DNS).
2. Submit sitemap: `https://base-mind.vercel.app/sitemap.xml`.
3. Bing Webmaster → import from GSC or verify manually → submit same sitemap.
4. Request indexing for `/` after each major release.
