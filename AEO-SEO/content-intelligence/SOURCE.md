# Source & Attribution

Vendored from **https://github.com/k-indig/content-intelligence**
Author: Kevin Indig — powers analysis for his Growth Memo newsletter
Copied: 2026-08-28

## ⚠️ License status
The upstream repository has **no LICENSE file**. Under default copyright that means
all rights reserved. Kept here for reference only. Ask the author before reusing.

## ⚠️ GitHub Actions workflows were REMOVED on purpose
Upstream ships `.github/workflows/` with **scheduled** workflows:
- `update-glossary.yml` — cron `0 * * * *` (**hourly**)
- `ingest.yml` — cron `0 8 * * 1` (weekly)

Copied as-is onto a default branch they would run *in this repository*, fail for
lack of secrets, and generate hourly failed-run notifications and wasted Actions
minutes. They are excluded here. Fetch them from upstream if you ever actually
deploy this.

## What it is
A Streamlit app for content analysis: article explorer, content gap analysis,
internal linking, writing assistant, glossary builder. Ingests RSS + GA/GSC
analytics into Supabase with OpenAI embeddings.

Credentials are read from env vars / Streamlit secrets (`config.py`) — no
secrets are committed upstream or here.
