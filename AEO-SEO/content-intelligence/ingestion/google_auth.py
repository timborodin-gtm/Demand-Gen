"""Shared Google API auth for GA4 and GSC."""
import base64
import json

from google.oauth2.service_account import Credentials

from config import GOOGLE_SERVICE_ACCOUNT_JSON

GA4_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]
GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]


def _decode_service_account_info() -> dict:
    """Decode the base64-encoded service account JSON."""
    raw = base64.b64decode(GOOGLE_SERVICE_ACCOUNT_JSON)
    return json.loads(raw)


def get_ga4_credentials() -> Credentials:
    return Credentials.from_service_account_info(
        _decode_service_account_info(), scopes=GA4_SCOPES
    )


def get_gsc_credentials() -> Credentials:
    return Credentials.from_service_account_info(
        _decode_service_account_info(), scopes=GSC_SCOPES
    )
