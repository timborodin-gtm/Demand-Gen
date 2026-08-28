# Workspace Template

Copy this folder when you want a clean starter workspace without running the CLI yet.

Default single-brand setup:

```bash
cp -R workspace-template/brand workspace/brand
```

Named brand setup:

```bash
mkdir -p workspace/brands
cp -R workspace-template/brand workspace/brands/acme
```

The easier path is still:

```bash
./install.sh
./install.sh --brand acme
```

The template is intentionally generic. Real brand files, briefs, drafts, API caches, and audit trails should stay inside `workspace/`, which is ignored by git by default.
