"""
Google Ads OAuth 2.0 Setup

Generates the refresh token the Google Ads scripts need.

Run this once, authorize in the browser, and it saves
GOOGLE_ADS_REFRESH_TOKEN into the .env file in this directory.

Prereqs in .env (set these first):
    GOOGLE_ADS_CLIENT_ID=...
    GOOGLE_ADS_CLIENT_SECRET=...

Usage:
    python setup_oauth.py
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# OAuth2 scope for the Google Ads API.
SCOPES = ["https://www.googleapis.com/auth/adwords"]

# The local redirect the OOB flow's replacement uses. Must match an
# authorized redirect URI on your OAuth client (a Desktop App client
# allows localhost on any port by default).
PORT = 8080

_HERE = Path(__file__).parent
# Canonical .env lives at the repo root (where onboarding creates it).
_ROOT = Path(__file__).resolve().parents[4]
_ENV_PATH = _ROOT / ".env"


def _save_refresh_token(token: str) -> None:
    """Write GOOGLE_ADS_REFRESH_TOKEN into .env, replacing any existing value."""
    if not _ENV_PATH.exists():
        # Seed from the repo template if the user hasn't created .env yet.
        example = _ROOT / ".env.example"
        if example.exists():
            _ENV_PATH.write_text(example.read_text())
        else:
            _ENV_PATH.write_text("")

    lines = _ENV_PATH.read_text().splitlines()
    found = False
    for i, line in enumerate(lines):
        if line.startswith("GOOGLE_ADS_REFRESH_TOKEN="):
            lines[i] = f"GOOGLE_ADS_REFRESH_TOKEN={token}"
            found = True
            break
    if not found:
        lines.append(f"GOOGLE_ADS_REFRESH_TOKEN={token}")

    _ENV_PATH.write_text("\n".join(lines) + "\n")


def main() -> None:
    load_dotenv(_ENV_PATH)

    client_id = os.getenv("GOOGLE_ADS_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_ADS_CLIENT_SECRET")

    if not client_id or not client_secret:
        print("ERROR: Set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in .env first.")
        print("Get them from Google Cloud Console -> APIs & Services -> Credentials")
        print("(create an OAuth 2.0 Client ID of type 'Desktop app').")
        sys.exit(1)

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("ERROR: google-auth-oauthlib is missing.")
        print("Run: pip install google-ads python-dotenv tabulate")
        sys.exit(1)

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [f"http://localhost:{PORT}/"],
        }
    }

    print("=" * 60)
    print("Google Ads OAuth 2.0 Setup")
    print("=" * 60)
    print("\nA browser window will open. Log in and authorize access.")
    print("If it doesn't open automatically, copy the URL it prints.\n")

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
    # access_type=offline + prompt=consent guarantees a refresh token is returned.
    creds = flow.run_local_server(
        port=PORT,
        access_type="offline",
        prompt="consent",
        authorization_prompt_message="Open this URL to authorize:\n\n{url}\n",
        success_message="Done. You can close this window and return to the terminal.",
    )

    if not creds.refresh_token:
        print("\nERROR: No refresh token returned. Revoke the app's access at")
        print("https://myaccount.google.com/permissions and run this again.")
        sys.exit(1)

    _save_refresh_token(creds.refresh_token)

    print("\nRefresh token saved to .env (GOOGLE_ADS_REFRESH_TOKEN).")
    print("\nNext steps:")
    print("  1. Make sure GOOGLE_ADS_DEVELOPER_TOKEN and GOOGLE_ADS_CUSTOMER_ID are set in .env")
    print("  2. Test it: python account_overview.py")


if __name__ == "__main__":
    main()
