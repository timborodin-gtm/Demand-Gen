"""Core glossary logic shared by the Streamlit page and the batch script."""

import re

import anthropic

from config import (
    ANTHROPIC_API_KEY,
    CLAUDE_MODEL,
    GLOSSARY_SECTIONS,
    SUBSTACK_BASE_URL,
)

SYSTEM_PROMPT = """You are a writing assistant for Kevin Indig, author of the Growth Memo newsletter about SEO, organic growth, and AI search.

Your job is to write a glossary entry for a term or concept based on how Kevin has actually used and explained it across his articles. Write in Kevin's voice: direct, analytical, practitioner-focused. No fluff.

The glossary entry must have exactly these sections in this order. Use a level-1 markdown heading (#) for the term and level-2 headings (##) for each body section. The Suggested section, Subtitle, Meta title, and Meta description are metadata fields — keep each as a bold label on its own line with the value below it.

# [Term]

**Suggested section**
The single best-fitting section for this entry, chosen from the list of available sections provided in the prompt. Output only the section name, exactly as written in that list. This tells whoever publishes the entry which content tag to apply so it appears in the right tab on the site.

**Subtitle**
A single sentence (max 140 characters) that previews the entry. Select the most striking, provocative, or interesting sentence from what will become the "Why it matters" section, verbatim or lightly tightened to fit the length. This becomes the preview copy in the Beehiiv post layout.

**Meta title**
A search-friendly title for the entry, max 60 characters. If the entry answers a question or query, use the question itself as the meta title. Otherwise format it as "What is [term]?".

**Meta description**
A single sentence, max 155 characters, drawn from the definition in the first body section. It should stand alone as a SERP snippet — clear, specific, no marketing fluff.

The first body section is conditional on the input:
- For a plain term or concept, use the heading "## What it means" followed by a clear, concise definition (2–4 sentences). Base this on how Kevin has described or used the term across his articles — not generic textbook definitions.
- For a question or query (the input is phrased as a question), use the heading "## The quick answer" followed by a direct, succinct answer to the question rather than a definition.

## Why it matters
Why this concept is important for SEO practitioners and growth teams (2–4 sentences). Ground it in the practical implications Kevin has written about. Then include at least one concrete example that illustrates the concept in action. The example must be hypothetical and clearly signposted as hypothetical: open it with framing like "Say a..." or "Imagine a...", and use a generic descriptor ("a mid-market B2B SaaS company", "a DTC skincare brand") rather than a real, named company. Never name a real, identifiable company, product, person, or publication in an example, even when a real one would fit — the reader must never be able to mistake the example for a documented case study. Keep it specific with a concrete metric shift or before/after scenario, but the specificity comes from the numbers and the scenario, not from borrowing a real brand's name.

## How to use this knowledge
2–4 concrete, actionable steps or approaches for applying this concept. Frame it for practitioners — what would a growth team or SEO lead actually do with this? Base it on the provided excerpts where possible; use domain knowledge to fill gaps.

## Growth Memo guidance
2–3 direct insights or quotes from Kevin's actual articles below. Use the exact wording where possible, or paraphrase closely. Format each one as a markdown blockquote with the source as an inline hyperlink on the line below, like this:

> The quoted insight goes here in a single blockquote line.
> — [Article Title](full URL)

Leave a blank line between each blockquote. Do not use parentheses around the source. Do not write "Source:" — just the em-dash and the linked title.

## Related concepts
3–5 closely related terms, each with a one-sentence explanation of how it connects. Example format:
- **Content clusters** — the structural method for building topical authority

## Referenced in these Growth Memos
A bulleted list of every article in the context below that meaningfully references this term, formatted as:
- [Article Title](full URL)

Address the reader directly throughout the entry. Use "you" and "your" instead of third-person references like "SEO practitioners", "growth teams", or "marketers". For example, write "helps you recognize that your content..." not "helps SEO practitioners recognize that their content...". The reader is an SEO practitioner or growth leader, so speak to them directly.

Keep the whole entry under 600 words. Do not invent content for the Growth Memo sections — only use what's in the provided article excerpts. You may use domain knowledge for "How to use this knowledge" and "Related concepts".

---

WRITING STYLE RULES — follow these strictly:

HARD BANS (never do these):
- No em dashes (—) in prose. Use commas, colons, parentheses, or split into two sentences. The only exceptions are the attribution line of a Growth Memo guidance blockquote and the Related concepts bullet format.
- No emoji in headings or bullets.
- Sentence case for headings, not Title Case.
- Bold sparingly — only for true labels, never for emphasis or decoration.
- No inline-header lists (Label: item, Label: item…). Use prose or a real table.
- No conclusion or recap sections. End when the work is done.
- No didactic disclaimers: "it is important to note", "it is crucial to", "may vary", etc.
- No "Not X, but Y" constructions. State the claim once, plainly.
- No "challenges / future prospects" boilerplate that ends on an upbeat note.
- No "serves as", "stands as", "marks", "represents" as substitutes for "is/are".
- No vague attributions ("experts say", "studies show") — name the source or remove the claim.
- No significance inflation: "pivotal moment", "vital role", "sets the stage", "transformative impact".
- No rule-of-three stacks used repeatedly as a polish device.
- No "From X to Y" ranges that don't define a real scale.

BANNED WORDS — never use:
delve, landscape, evolving, context, insight, nuanced, perspective, paradigm, comprehensive, supercharge, framework, facet, dynamic, intricacies, holistic, iterative, synergy, confluence, pivotal, nuance, robust, transformative, underpinning, spectrum, trajectory, in-depth, tapestry, testament, intrigue, elusive, quintessential, symphony, labyrinth, resonance, embodiment, monumental, ethereal, boundless, mosaic, woven, sculpted, intricate, otherworldly.

BANNED OPENERS AND TRANSITIONS — never use:
"In fact,", "Indeed,", "Absolutely,", "Clearly,", "First and foremost,", "As a result,", "Therefore,", "Consequently,", "In other words,", "To put it simply,", "In summary,", "In conclusion,", "All in all,", "More importantly,", "On one hand / on the other hand,", "The challenge is,", "The key issue is,", "Here's the kicker.", "In a world of."

STYLE:
- Vary sentence lengths. Avoid repeating the same sentence structure across paragraphs.
- Repeat the exact term when needed for clarity — do not cycle synonyms.
- No metaphors, idioms, clichés, or hyperbole.
- No generic advice or invented examples.
- Use numerals for numbers (write "3", not "three"). Two exceptions: spell out a number that begins a sentence, and always spell out "one".
- On the first mention of AI Overviews, write "AI Overviews (AIOs)". Every mention after that uses "AIO" or "AIOs"."""


def slug_to_url(slug: str) -> str:
    clean = re.sub(r"^\d+\.", "", slug)
    return f"{SUBSTACK_BASE_URL}/p/{clean}"


_COLON_SENTENCE_RE = re.compile(r"(:\s+)([a-z])(?=[^\n]*?[.!?](?:\s|$))")


def _capitalize_after_colon(text: str) -> str:
    """Capitalize the first letter after a colon when an independent clause follows.

    Heuristic: only capitalize when the text after the colon (up to the next
    line break) contains a sentence-ending punctuation mark, which signals a
    full sentence rather than a fragment or list item. Skips URLs (e.g. https://)
    by requiring the colon to be followed by whitespace.
    """
    def repl(match: re.Match) -> str:
        return match.group(1) + match.group(2).upper()
    return _COLON_SENTENCE_RE.sub(repl, text)


def _dedup_references(text: str) -> str:
    """Remove duplicate bullet lines in the 'Referenced in these Growth Memos' section."""
    marker = "## Referenced in these Growth Memos"
    idx = text.find(marker)
    if idx == -1:
        return text

    before = text[:idx + len(marker)]
    after = text[idx + len(marker):]

    seen = set()
    deduped_lines = []
    for line in after.split("\n"):
        stripped = line.strip()
        if stripped.startswith("- "):
            if stripped in seen:
                continue
            seen.add(stripped)
        deduped_lines.append(line)

    return before + "\n".join(deduped_lines)


def _build_direction_block(
    angle: str = "",
    notes: str = "",
    source_links: list[str] | None = None,
) -> str:
    """Format the editor's optional steering input for the prompt.

    Returns an empty string when no direction was provided, so terms with no
    notes generate exactly as before.
    """
    parts = []
    if angle and angle.strip():
        parts.append(f"Angle / point of view to take: {angle.strip()}")
    if notes and notes.strip():
        parts.append(f"Editor notes: {notes.strip()}")
    if source_links:
        links = "\n".join(f"- {url}" for url in source_links if url and url.strip())
        if links:
            parts.append(
                "The editor flagged these existing URLs as places this term is "
                "discussed. Use them where they strengthen the entry (for example "
                "in Growth Memo guidance or Referenced in these Growth Memos), but "
                "only if they genuinely fit:\n" + links
            )
    if not parts:
        return ""
    return (
        "\n\nEditorial direction from the editor — follow it closely, it reflects "
        "the angle this entry should take:\n" + "\n\n".join(parts)
    )


def build_glossary_entry(
    term: str,
    chunks: list[dict],
    angle: str = "",
    notes: str = "",
    source_links: list[str] | None = None,
) -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    seen_articles = {}
    for chunk in chunks:
        aid = chunk["article_id"]
        if aid not in seen_articles:
            seen_articles[aid] = {
                "title": chunk["article_title"],
                "url": slug_to_url(chunk["article_url_slug"]),
                "excerpts": [],
            }
        seen_articles[aid]["excerpts"].append(chunk["chunk_text"][:600])

    context_blocks = []
    for info in seen_articles.values():
        excerpts = "\n\n".join(info["excerpts"][:3])
        context_blocks.append(
            f"### {info['title']}\nURL: {info['url']}\n\n{excerpts}"
        )

    context = "\n\n---\n\n".join(context_blocks)

    sections = ", ".join(GLOSSARY_SECTIONS)
    direction = _build_direction_block(angle, notes, source_links)

    user_content = (
        f"Write a glossary entry for this term: **{term}**\n\n"
        f"Available sections (pick exactly one for the Suggested section field): {sections}"
        f"{direction}\n\n"
        f"Here are excerpts from Kevin's Growth Memo articles that reference it:\n\n{context}"
    )

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": user_content,
            }
        ],
    )
    text = response.content[0].text
    text = _dedup_references(text)
    text = _capitalize_after_colon(text)
    return text
