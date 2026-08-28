import streamlit as st


def require_auth():
    """Block page if user hasn't authenticated via the main app password gate."""
    try:
        correct_password = st.secrets["APP_PASSWORD"]
    except Exception:
        import os
        correct_password = os.getenv("APP_PASSWORD")

    if not correct_password:
        return  # No password configured

    if not st.session_state.get("authenticated"):
        st.warning("Please log in from the home page first.")
        st.stop()
