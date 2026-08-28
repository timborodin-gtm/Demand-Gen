# Source & Attribution

Vendored from **https://github.com/siliconvallaeys/Pmax-Search-Terms**
Author: Frederick Vallaeys (Optmyzr)
License: MIT — see `LICENSE` (© 2024 Frederick Vallaeys)
Copied: 2026-08-28, at upstream commit `1d636e1`

## What it does
Google Ads Script that exports Performance Max search terms to a Google Sheet,
including category labels and a column flagging whether each term already exists
as a keyword in a Search campaign (PMax/Search cannibalization check).

Metrics: conversion value, conversions, clicks, impressions.

## Config (top of `adscript.js`)
- `minImp` — minimum impressions to include (default 10)
- `spreadsheetUrl` — blank creates a new sheet
- `reportLastNDays` — lookback window (default 30)
- `EMAILADDRESS` — recipient

## Notes
- Install on a **standard Google Ads account, not an MCC**.
- Upstream is unmaintained: 2 commits, nothing since March 2024.
