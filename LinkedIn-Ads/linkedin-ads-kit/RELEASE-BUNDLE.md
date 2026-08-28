# Release Bundle

Use this when packaging LinkedIn Ads Kit as a weekly giveaway.

## Bundle Checklist

1. Start from a clean working tree.
2. Run the test suite.
3. Smoke test the installer.
4. Create the zip from git-tracked files.
5. Upload the zip or attach it to the release post.

```bash
git status --short
npm test
./install.sh --demo
mkdir -p dist
git archive --format=zip --prefix=linkedin-ads-kit/ -o dist/linkedin-ads-kit.zip HEAD
unzip -l dist/linkedin-ads-kit.zip | grep -Eq '(^|/)\.env($|[[:space:]])' && { echo "LEAK: .env in bundle"; exit 1; } || echo "OK: no .env in bundle"
```

The smoke test drops `--skip-npm` so `npm install` runs first and `brand:init` finds its dependencies. Exclusion of `.env` (and other local/dev paths) is enforced by `.gitattributes`; the `unzip -l` check above is a belt-and-braces assertion that must pass before you ship.

The bundle should include:

- `README.md`
- `SETUP.md`
- `DEMO-WORKFLOW.md`
- `OPERATOR-PLAYBOOK.md`
- `SOUL.md`
- `install.sh`
- `.env.example`
- `package.json`
- `src/`
- `bin/`
- `skills/`
- `examples/`
- `workspace-template/`

It should not include:

- `.env`
- `node_modules/`
- local `workspace/brand/` data
- local `workspace/brands/<slug>/` data
- downloaded client exports

## User Install

```bash
unzip linkedin-ads-kit.zip
cd linkedin-ads-kit
./install.sh
npm run demo
```

Named brand setup:

```bash
./install.sh --brand acme
npm run demo -- --brand acme
```

Export Mode works immediately. Connected Mode needs LinkedIn Developer credentials in `.env`.

## Claude Code Notes

Open the unzipped folder in Claude Code and ask it to start with:

```text
Read README.md, SETUP.md, and OPERATOR-PLAYBOOK.md. Then run npm run demo and summarize the generated brief.
```

For real account work, give Claude Code the brand slug and point it at local exports:

```text
Run the daily LinkedIn Ads brief for brand acme using my campaign export, lead export, and CRM CSV. Do not apply live changes.
```

Live writes should stay gated behind:

```bash
npm run apply -- --brand acme --draft path/to/draft.md --dry-run
npm run apply -- --brand acme --draft path/to/draft.md --confirm APPLY
```

## OpenClaw Notes

Open the folder as a project and let OpenClaw use the repo files as context.

Suggested first prompt:

```text
Use this kit as a file-first LinkedIn Ads operator. Initialize the workspace, run the demo, and explain the daily brief.
```

For public giveaway users, recommend Export Mode first:

```bash
npm run daily:brief -- --campaigns campaigns.csv --leads leads.csv --crm crm.csv
npm run export:brief -- --campaigns campaigns.csv --leads leads.csv --crm crm.csv
```

Connected Mode can come later after LinkedIn Marketing API access is approved.
