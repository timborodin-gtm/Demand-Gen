"""Orchestrator: parse → chunk → embed → store in Supabase."""
import sys

from db.client import get_client, upsert_article, upsert_chunks, get_article_count, get_chunk_count
from ingestion.parse import parse_substack_export
from ingestion.chunk import chunk_article
from ingestion.embed import embed_texts


def ingest(zip_path: str):
    """Run the full ingestion pipeline on a Substack export ZIP."""
    client = get_client()

    print(f"Parsing ZIP: {zip_path}")
    articles = parse_substack_export(zip_path)
    print(f"Found {len(articles)} articles")

    total_chunks = 0
    for i, article in enumerate(articles):
        # Upsert article
        article_id = upsert_article(client, {
            "post_id": article["post_id"],
            "title": article["title"],
            "subtitle": article["subtitle"],
            "post_date": article["post_date"],
            "type": article["type"],
            "audience": article["audience"],
            "url_slug": article["url_slug"],
            "full_text_markdown": article["full_text_markdown"],
            "word_count": article["word_count"],
        })

        # Chunk the article
        chunks = chunk_article(article["full_text_markdown"])
        if not chunks:
            continue

        # Embed all chunks
        chunk_texts = [c["chunk_text"] for c in chunks]
        embeddings = embed_texts(chunk_texts)

        # Prepare chunk rows for upsert
        chunk_rows = []
        for chunk, embedding in zip(chunks, embeddings):
            chunk_rows.append({
                "article_id": article_id,
                "chunk_index": chunk["chunk_index"],
                "chunk_text": chunk["chunk_text"],
                "heading": chunk["heading"],
                "token_count": chunk["token_count"],
                "embedding": embedding,
            })

        upsert_chunks(client, chunk_rows)
        total_chunks += len(chunk_rows)

        if (i + 1) % 25 == 0 or i == len(articles) - 1:
            print(f"  Processed {i + 1}/{len(articles)} articles ({total_chunks} chunks so far)")

    # Final counts
    final_articles = get_article_count(client)
    final_chunks = get_chunk_count(client)
    print(f"\nDone! Supabase now has {final_articles} articles and {final_chunks} chunks.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m ingestion.ingest <path-to-substack-export.zip>")
        sys.exit(1)
    ingest(sys.argv[1])
