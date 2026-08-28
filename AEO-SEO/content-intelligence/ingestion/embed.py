from openai import OpenAI

from config import OPENAI_API_KEY, EMBEDDING_MODEL, EMBEDDING_BATCH_SIZE

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts in batches. Returns list of embedding vectors."""
    client = _get_client()
    all_embeddings = []

    for i in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[i : i + EMBEDDING_BATCH_SIZE]
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    return all_embeddings


def embed_single(text: str) -> list[float]:
    """Embed a single text. Returns one embedding vector."""
    return embed_texts([text])[0]
