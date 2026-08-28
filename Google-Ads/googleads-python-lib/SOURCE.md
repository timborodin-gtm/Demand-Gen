# Source & Attribution

Vendored from **https://github.com/googleads/googleads-python-lib**
Author: Google (googleads)
License: **Apache License 2.0** — see `LICENSE`.
Copied: 2026-08-28, at upstream commit `8eafa3d`

## ⚠️ Read this before using it
Despite the GitHub description ("The Python client library for Google's Ads APIs"),
this is the **Google Ad Manager SOAP API** client library. Its own README opens with:
"The Google Ad Manager SOAP API Python client library", and `googleads.yaml`
contains only an `ad_manager:` section.

**Google Ad Manager is the publisher/ad-serving side** (formerly DFP) — inventory,
line items, and serving ads on your own properties.

**For advertiser-side Google Ads work** (campaigns, keywords, bidding, search terms)
the correct library is **https://github.com/googleads/google-ads-python** — a
different repo, actively maintained, 744★.

## Modifications from upstream
None. Copied verbatim; upstream ships no `.github/` workflows.
