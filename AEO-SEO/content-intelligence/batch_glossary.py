"""Batch glossary builder.

Reads terms from a file and generates a glossary entry for each using the same
pipeline as the Streamlit Glossary page.

Two input formats are supported:

1. Plain text — one term per line (the original format).

2. Structured CSV/TSV — a header row whose first column is "term", plus any of
   these optional columns: status, angle, notes, links. This is the term-intake
   format: fill in an angle or notes to steer the entry, drop in URLs you
   already know reference the term, and use the status column to control what
   gets generated. Separate multiple links with spaces or pipes (not commas).

   Status values that skip generation: skip, veto, hold, done, published.
   Any other status (e.g. revise, input needed, human writing needed) still
   generates a draft and is listed in a review queue printed at the end.

Usage:
    python batch_glossary.py terms.txt                  # writes glossary.md
    python batch_glossary.py terms.csv                  # structured intake
    python batch_glossary.py terms.txt -o my_output.md  # custom output file
    python batch_glossary.py terms.txt --articles 20    # search more articles
    python batch_glossary.py terms.txt --threshold 0.4  # looser relevance
"""

import argparse
import csv
import re
import sys
import time

from db.client import get_client, match_chunks
from ingestion.embed import embed_single
import glossary_core

# Statuses that mean "do not generate a draft for this term".
SKIP_STATUSES = {"skip", "veto", "kevin veto", "hold", "done", "published"}


def _split_links(raw: str) -> list[str]:
    """Split a links cell into individual URLs (separated by space, pipe, or semicolon)."""
    if not raw:
        return []
    return [u.strip() for u in re.split(r"[\s;|]+", raw) if u.strip()]


def load_terms(path: str) -> list[dict]:
    """Load term specs from a plain-text or structured CSV/TSV file.

    Always returns a list of dicts with keys: term, status, angle, notes, links.
    Plain-text lines populate only ``term``; the rest default to empty.
    """
    with open(path, encoding="utf-8") as f:
        lines = [line.rstrip("\n") for line in f if line.strip()]

    if not lines:
        return []

    header = lines[0]
    delimiter = "\t" if "\t" in header else ("," if "," in header else None)
    if delimiter:
        reader = csv.DictReader(lines, delimiter=delimiter)
        if reader.fieldnames and reader.fieldnames[0].strip().lower() == "term":
            specs = []
            for row in reader:
                term = (row.get("term") or "").strip()
                if not term:
                    continue
                specs.append({
                    "term": term,
                    "status": (row.get("status") or "").strip(),
                    "angle": (row.get("angle") or "").strip(),
                    "notes": (row.get("notes") or "").strip(),
                    "links": _split_links((row.get("links") or "").strip()),
                })
            return specs

    # Plain text: one term per line.
    return [
        {"term": line.strip(), "status": "", "angle": "", "notes": "", "links": []}
        for line in lines
    ]


def main():
    parser = argparse.ArgumentParser(description="Batch glossary builder")
    parser.add_argument("terms_file", help="Text file with one term per line")
    parser.add_argument("-o", "--output", default="glossary.md",
                        help="Output markdown file (default: glossary.md)")
    parser.add_argument("--articles", type=int, default=15,
                        help="Max articles to search per term (default: 15)")
    parser.add_argument("--threshold", type=float, default=0.45,
                        help="Similarity threshold (default: 0.45)")
    args = parser.parse_args()

    specs = load_terms(args.terms_file)
    if not specs:
        print("No terms found in file.")
        sys.exit(1)

    print(f"Loaded {len(specs)} terms from {args.terms_file}")
    print(f"Output: {args.output} | articles: {args.articles} | threshold: {args.threshold}\n")

    db = get_client()
    entries = []
    skipped = []        # (term, status) for vetoed/done terms
    review_queue = []   # (term, status) for generated drafts that need a human pass
    generated = 0

    for i, spec in enumerate(specs, 1):
        term = spec["term"]
        status = spec["status"]
        print(f"[{i}/{len(specs)}] {term}...")

        if status.lower() in SKIP_STATUSES:
            print(f"  Skipped (status: {status}).")
            skipped.append((term, status))
            continue

        embedding = embed_single(term)
        chunks = match_chunks(
            db,
            query_embedding=embedding,
            match_count=args.articles,
            similarity_threshold=args.threshold,
        )

        if not chunks:
            print("  No relevant passages found, skipping.")
            entries.append(f"## {term}\n\n*No relevant passages found.*\n")
            review_queue.append((term, "no passages found — needs human writing"))
            continue

        article_count = len({c["article_id"] for c in chunks})
        print(f"  Found {article_count} articles ({len(chunks)} passages)")

        entry = glossary_core.build_glossary_entry(
            term,
            chunks,
            angle=spec["angle"],
            notes=spec["notes"],
            source_links=spec["links"],
        )
        entries.append(entry)
        generated += 1
        if status:
            review_queue.append((term, status))
        print("  Done")

        # Brief pause between API calls to be respectful
        if i < len(specs):
            time.sleep(1)

    with open(args.output, "w", encoding="utf-8") as f:
        f.write("# Glossary\n\n")
        f.write("\n\n---\n\n".join(entries))
        f.write("\n")

    print(f"\nWrote {generated} entries to {args.output}")
    if skipped:
        print(f"\nSkipped {len(skipped)} term(s):")
        for term, status in skipped:
            print(f"  - {term} ({status})")
    if review_queue:
        print(f"\nReview queue — {len(review_queue)} draft(s) flagged for a human pass:")
        for term, status in review_queue:
            print(f"  - {term} ({status})")


if __name__ == "__main__":
    main()
