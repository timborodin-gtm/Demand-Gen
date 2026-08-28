# Workspace

This is the kit's local working memory.

Use the default single-brand workspace:

```bash
npm run brand:init
```

Or create named brands for multi-client work:

```bash
npm run brand:init -- --brand acme
npm run daily:brief -- --brand acme --campaigns examples/exports/linkedin-campaigns.csv
```

Generated account data, brand context, briefs, drafts, and API caches stay in `workspace/` and are ignored by git by default.
