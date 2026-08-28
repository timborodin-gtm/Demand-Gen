import re
import tiktoken

from config import MAX_CHUNK_TOKENS, MERGE_THRESHOLD_TOKENS

_enc = tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(_enc.encode(text))


def split_by_headings(markdown: str) -> list[dict]:
    """Split markdown into sections by h2/h3 headings."""
    pattern = r"^(#{2,3})\s+(.+)$"
    sections = []
    current_heading = None
    current_lines = []

    for line in markdown.split("\n"):
        match = re.match(pattern, line)
        if match:
            # Save previous section
            if current_lines:
                text = "\n".join(current_lines).strip()
                if text:
                    sections.append({"heading": current_heading, "text": text})
            current_heading = match.group(2).strip()
            current_lines = []
        else:
            current_lines.append(line)

    # Save last section
    if current_lines:
        text = "\n".join(current_lines).strip()
        if text:
            sections.append({"heading": current_heading, "text": text})

    return sections


def split_by_paragraphs(text: str, max_tokens: int) -> list[str]:
    """Split a long text into chunks by paragraph boundaries."""
    paragraphs = re.split(r"\n{2,}", text)
    chunks = []
    current = []
    current_tokens = 0

    for para in paragraphs:
        para_tokens = count_tokens(para)
        if current_tokens + para_tokens > max_tokens and current:
            chunks.append("\n\n".join(current))
            current = [para]
            current_tokens = para_tokens
        else:
            current.append(para)
            current_tokens += para_tokens

    if current:
        chunks.append("\n\n".join(current))
    return chunks


def merge_small_sections(sections: list[dict], threshold: int) -> list[dict]:
    """Merge consecutive small sections up to threshold tokens."""
    if not sections:
        return sections

    merged = [sections[0].copy()]
    for section in sections[1:]:
        prev_tokens = count_tokens(merged[-1]["text"])
        curr_tokens = count_tokens(section["text"])
        if prev_tokens + curr_tokens <= threshold:
            merged[-1]["text"] += "\n\n" + section["text"]
            # Keep the first heading if present, otherwise use the new one
            if not merged[-1]["heading"]:
                merged[-1]["heading"] = section["heading"]
        else:
            merged.append(section.copy())
    return merged


def chunk_article(markdown: str) -> list[dict]:
    """Chunk an article into pieces suitable for embedding.

    Returns list of dicts with keys: chunk_index, chunk_text, heading, token_count
    """
    sections = split_by_headings(markdown)

    # If no headings found, treat entire text as one section
    if not sections:
        sections = [{"heading": None, "text": markdown}]

    # Merge small consecutive sections
    sections = merge_small_sections(sections, MERGE_THRESHOLD_TOKENS)

    # Split oversized sections by paragraphs
    final_chunks = []
    for section in sections:
        tokens = count_tokens(section["text"])
        if tokens > MAX_CHUNK_TOKENS:
            sub_texts = split_by_paragraphs(section["text"], MAX_CHUNK_TOKENS)
            for sub in sub_texts:
                final_chunks.append({
                    "heading": section["heading"],
                    "text": sub,
                })
        else:
            final_chunks.append(section)

    # Build output with indices and token counts
    result = []
    for i, chunk in enumerate(final_chunks):
        text = chunk["text"].strip()
        if not text:
            continue
        result.append({
            "chunk_index": i,
            "chunk_text": text,
            "heading": chunk.get("heading"),
            "token_count": count_tokens(text),
        })
    return result
