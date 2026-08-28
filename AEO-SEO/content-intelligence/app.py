import streamlit as st

st.set_page_config(
    page_title="Content Intelligence — Growth Memo",
    page_icon="📊",
    layout="wide",
)


def check_password():
    """Simple password gate. Set APP_PASSWORD in Streamlit secrets or .env."""
    try:
        correct_password = st.secrets["APP_PASSWORD"]
    except Exception:
        import os
        correct_password = os.getenv("APP_PASSWORD")

    if not correct_password:
        return True  # No password configured, skip gate

    if "authenticated" not in st.session_state:
        st.session_state["authenticated"] = False

    if st.session_state["authenticated"]:
        return True

    st.title("Content Intelligence")
    password = st.text_input("Enter password to continue", type="password")
    if password:
        if password == correct_password:
            st.session_state["authenticated"] = True
            st.rerun()
        else:
            st.error("Incorrect password.")
    return False


if not check_password():
    st.stop()

st.title("Content Intelligence")
st.subheader("Growth Memo — AI-Powered Content Analysis")

st.markdown("""
Welcome to your content intelligence dashboard. Use the sidebar to navigate:

**Article Explorer** — Browse, search, and filter your 436 Growth Memo articles.

**Content Gap Analysis** — Discover topic clusters and find gaps in your content coverage.

**Internal Linking** — Get AI-powered linking suggestions for any article or draft.
""")

# Show quick stats if data is available
try:
    from db.client import get_client, get_article_count, get_chunk_count
    client = get_client()
    col1, col2 = st.columns(2)
    with col1:
        st.metric("Articles", get_article_count(client))
    with col2:
        st.metric("Chunks", get_chunk_count(client))
except Exception:
    st.info("Connect your Supabase database and run ingestion to see stats here.")
