#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

brand=""
run_demo="false"
skip_npm="false"

usage() {
  cat <<'USAGE'
LinkedIn Ads Kit installer

Usage:
  ./install.sh [--brand <slug>] [--demo] [--skip-npm]

Options:
  --brand <slug>   Initialize workspace/brands/<slug>/ instead of workspace/brand/
  --demo           Run the example demo after install
  --skip-npm       Skip npm install
  -h, --help       Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --brand)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "Missing value for --brand" >&2
        exit 1
      fi
      brand="$2"
      shift 2
      ;;
    --demo)
      run_demo="true"
      shift
      ;;
    --skip-npm)
      skip_npm="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_command node
need_command npm

node -e 'const major = Number(process.versions.node.split(".")[0]); if (major < 20) { console.error(`Node 20+ required. Current: ${process.versions.node}`); process.exit(1); }'

echo "LinkedIn Ads Kit"
echo "Working directory: $ROOT_DIR"
echo

if [[ "$skip_npm" == "false" ]]; then
  echo "Installing Node dependencies..."
  npm install
  echo
else
  echo "Skipping npm install."
  echo
fi

if [[ ! -f ".env" && -f ".env.example" ]]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "Fill it in later for Connected Mode. Export Mode works without API credentials."
  echo
elif [[ -f ".env" ]]; then
  echo ".env already exists. Leaving it alone."
  echo
fi

if [[ -n "$brand" ]]; then
  echo "Initializing named brand workspace: $brand"
  npm run brand:init -- --brand "$brand"
else
  echo "Initializing default brand workspace."
  npm run brand:init
fi
echo

if [[ "$run_demo" == "true" ]]; then
  if [[ -n "$brand" ]]; then
    echo "Running demo in named brand workspace: $brand"
    npm run demo -- --brand "$brand"
  else
    echo "Running demo in sample brand workspace: exampleco"
    npm run demo
  fi
  echo
fi

echo "Install complete."
echo
echo "Next commands for your real workspace:"
if [[ -n "$brand" ]]; then
  echo "  npm run daily:brief -- --brand $brand --campaigns examples/exports/linkedin-campaigns.csv --leads examples/exports/linkedin-leads.csv --crm examples/exports/crm-leads.csv"
  echo "  npm run export:brief -- --brand $brand --campaigns examples/exports/linkedin-campaigns.csv --leads examples/exports/linkedin-leads.csv --crm examples/exports/crm-leads.csv"
  echo "  npm run connected:brief -- --brand $brand"
else
  echo "  npm run daily:brief -- --campaigns examples/exports/linkedin-campaigns.csv --leads examples/exports/linkedin-leads.csv --crm examples/exports/crm-leads.csv"
  echo "  npm run export:brief -- --campaigns examples/exports/linkedin-campaigns.csv --leads examples/exports/linkedin-leads.csv --crm examples/exports/crm-leads.csv"
  echo "  npm run connected:brief"
fi
echo
echo "Open README.md for the overview, SETUP.md for the install path, and RELEASE-BUNDLE.md for giveaway packaging."
