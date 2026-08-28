const BUYER_PAIN_WORDS = [
  "pipeline",
  "revenue",
  "sales",
  "budget",
  "risk",
  "cost",
  "waste",
  "problem",
  "buyer",
  "conversion",
  "qualified",
  "trust",
  "proof"
];

const FRONT_MATTER_PATTERN = /^---\n([\s\S]*?)\n---\n?/;

export function scoreThoughtLeaderPost(post = {}, brandMemory = {}) {
  const text = String(post.text || post.commentary || post.body || "").toLowerCase();
  const audienceText = `${brandMemory.audience || ""} ${brandMemory.offer || ""}`.toLowerCase();
  const engagement = numeric(post.reactions) + numeric(post.comments) * 2 + numeric(post.shares) * 3;

  const icpFit = scoreKeywordOverlap(text, audienceText);
  const buyerPain = scoreWordHits(text, BUYER_PAIN_WORDS, 20);
  const trust = scoreTrust(text);
  const organicSignal = Math.min(20, Math.round(Math.log10(engagement + 1) * 10));
  const offerFit = scoreWordHits(text, extractImportantWords(brandMemory.offer), 15);
  const salesUsefulness = /(how|why|mistake|lesson|framework|example|case|before|after|roi|proof)/.test(text) ? 15 : 7;

  const total = clamp(icpFit + buyerPain + trust + organicSignal + offerFit + salesUsefulness, 0, 100);

  return {
    total,
    icpFit,
    buyerPain,
    trust,
    organicSignal,
    offerFit,
    salesUsefulness,
    recommendation: total >= 75 ? "strong_candidate" : total >= 55 ? "test_candidate" : "manual_review"
  };
}

export function buildThoughtLeaderFallbackPacket({ post = {}, score, brandMemory = {}, campaign = {} }) {
  const postUrl = post.url || post.postUrl || "[paste post URL]";
  const brand = brandMemory.brand || "default";
  const shouldLaunch = score.recommendation !== "manual_review";
  const objective = shouldLaunch ? campaign.objective || "Engagement or Brand Awareness" : "Manual review before launch";
  const budget = shouldLaunch ? campaign.budget || "$50-$150/day test budget" : "No paid budget yet";
  const recommendation = shouldLaunch
    ? "This post is eligible for a controlled Thought Leader Ad test."
    : "Do not sponsor this post yet. Find or rewrite a candidate with clearer buyer pain, proof, ICP fit, and sales usefulness.";
  const approvalCopy = shouldLaunch
    ? "Can we sponsor this post from the company ad account? It is a fit because it speaks to the buyer pain we are already trying to create demand around. We will start with a controlled budget, measure paid engagement separately, and stop it if quality drops."
    : "Hold approval request. This candidate does not yet create the buyer-quality conversation we want paid spend to amplify.";

  return `## Campaign Manager Fallback Packet

Brand: ${brand}

### Post

${postUrl}

### Score

${score.total}/100 (${score.recommendation})

### Recommendation

${recommendation}

### Recommended Setup

- Objective: ${objective}
- Format: Match the organic post format
- Budget: ${budget}
- Audience: Use the ICP in the brand audience file; exclude customers and obvious non-buyers
- Placement: Start with LinkedIn feed; avoid expansion until quality is proven
- UTM: \`utm_source=linkedin&utm_medium=paid_social&utm_campaign=thought_leader_ad&utm_content={post_id}\`

### Approval Request Copy

${approvalCopy}

### Measurement Notes

- Save the organic baseline before launch.
- Track paid engagement, profile clicks, lead quality, and downstream sales notes.
- Do not judge this only by CPL. Judge whether the right people are engaging and moving into real conversations.
`;
}

function scoreKeywordOverlap(text, reference) {
  const words = extractImportantWords(reference);
  return scoreWordHits(text, words, 20);
}

function scoreWordHits(text, words, maxScore) {
  if (!words.length) return Math.round(maxScore * 0.4);
  const unique = new Set(words);
  let hits = 0;
  for (const word of unique) {
    if (text.includes(word)) hits += 1;
  }
  return Math.min(maxScore, Math.round((hits / Math.min(unique.size, 10)) * maxScore));
}

function scoreTrust(text) {
  let score = 5;
  if (/\b(i|we|our|my)\b/.test(text)) score += 4;
  if (/\d+/.test(text)) score += 5;
  if (/(learned|saw|tested|built|customer|client|case|proof|result)/.test(text)) score += 6;
  return Math.min(20, score);
}

function extractImportantWords(text = "") {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4)
    .filter((word) => !["their", "there", "about", "which", "should", "would", "could", "through"].includes(word))
    .slice(0, 40);
}

function numeric(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function parsePostFile({ content, filename = "" }) {
  const raw = String(content || "");
  const match = raw.match(FRONT_MATTER_PATTERN);
  const metadata = {};
  let body = raw;

  if (match) {
    body = raw.slice(match[0].length);
    for (const line of match[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const colon = trimmed.indexOf(":");
      if (colon === -1) continue;
      const key = trimmed.slice(0, colon).trim();
      const value = trimmed.slice(colon + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key) metadata[key] = value;
    }
  }

  const author = metadata.author || metadata.name || filename.replace(/\.md$/i, "") || "Candidate";
  const text = body.trim();

  return {
    filename,
    author,
    role: metadata.role || "",
    url: metadata.url || "",
    urn: metadata.urn || "",
    publishedAt: metadata.publishedAt || metadata.published_at || "",
    reactions: toNumber(metadata.reactions),
    comments: toNumber(metadata.comments),
    shares: toNumber(metadata.shares),
    text,
    excerpt: excerptOf(text),
    metadata
  };
}

export function buildThoughtLeaderScorecard({ posts = [], brandMemory = {} }) {
  const ranked = posts
    .map((post) => {
      const score = scoreThoughtLeaderPost(post, brandMemory);
      const scoreMax = 100;
      const engagement = numeric(post.reactions) + numeric(post.comments) * 2 + numeric(post.shares) * 3;
      return { post, score, scoreMax, engagement };
    })
    .sort((left, right) => right.score.total - left.score.total || right.engagement - left.engagement);

  const top = ranked[0] || null;
  const tiers = {
    strong_candidate: ranked.filter((entry) => entry.score.recommendation === "strong_candidate"),
    test_candidate: ranked.filter((entry) => entry.score.recommendation === "test_candidate"),
    manual_review: ranked.filter((entry) => entry.score.recommendation === "manual_review")
  };
  const headline = composeScorecardHeadline({ top, total: ranked.length, tiers });

  return { ranked, top, tiers, headline };
}

export function renderThoughtLeaderScorecard({ scorecard, brandMemory = {}, date = new Date() }) {
  const { ranked, headline, tiers } = scorecard;
  const brand = brandMemory.brand || "default";

  if (!ranked.length) {
    return `# Thought Leader Ads Scorecard

Brand: ${brand}
Generated: ${date.toISOString()}

No candidate posts were found. Drop 3-5 founder/operator posts as markdown files in \`examples/posts/\` (or your own \`workspace/brands/<brand>/posts/\`) and re-run.
`;
  }

  const rows = ranked.map((entry, index) => {
    const { post, score, engagement } = entry;
    return `### ${index + 1}. ${post.author}${post.role ? ` (${post.role})` : ""} - ${score.total}/100 (${score.recommendation})

- File: ${post.filename || "n/a"}
- URL: ${post.url || "[paste post URL]"}
- Engagement: ${engagement} weighted (${numeric(post.reactions)} reactions, ${numeric(post.comments)} comments, ${numeric(post.shares)} shares)
- ICP fit: ${score.icpFit}/20
- Buyer pain: ${score.buyerPain}/20
- Trust: ${score.trust}/20
- Organic signal: ${score.organicSignal}/20
- Offer fit: ${score.offerFit}/15
- Sales usefulness: ${score.salesUsefulness}/15
- Excerpt: ${post.excerpt || "(no excerpt)"}`;
  }).join("\n\n");

  const strongNote = tiers.strong_candidate.length
    ? `${tiers.strong_candidate.length} post(s) cleared the strong-candidate gate. Sponsor only after confirming the comment section looks like the buying committee, not like engagement pods.`
    : "No strong_candidate posts yet. Keep writing toward specific buyer pain and proof before paid amplification.";

  const reviewNote = tiers.manual_review.length
    ? `${tiers.manual_review.length} post(s) were flagged for manual review. Do not sponsor these. They need a clearer pain, proof point, or ICP fit first.`
    : "No manual-review-only posts in this batch. Keep the bar high as you add more candidates.";

  return `# Thought Leader Ads Scorecard

Brand: ${brand}
Generated: ${date.toISOString()}

${headline}

## How This Is Scored

| Signal | Question | Max |
|--------|----------|-----|
| ICP fit | Is the right buying committee likely to care? | 20 |
| Buyer pain | Does it name an expensive problem? | 20 |
| Trust | Does it sound like lived experience, not brand copy? | 20 |
| Organic signal | Did the market react before paid spend? | 20 |
| Offer fit | Does it connect to a real next step? | 15 |
| Sales usefulness | Would sales be glad this conversation started? | 15 |

Threshold: 75+ is a strong_candidate, 55-74 is a test_candidate, below 55 is manual_review.

## Ranked Candidates

${rows}

## Operator Note

${strongNote}

${reviewNote}
`;
}

export function buildThoughtLeaderLaunchPacket({ post = {}, score = {}, brandMemory = {}, campaign = {} }) {
  const postUrl = post.url || post.postUrl || "[paste post URL]";
  const postUrn = post.urn || post.postUrn || "[paste UGC post URN]";
  const author = post.author || "the post author";
  const role = post.role || "thought leader";
  const brand = brandMemory.brand || "default";
  const shouldLaunch = score.recommendation !== "manual_review";
  const objective = shouldLaunch ? campaign.objective || "Engagement or Website Visits" : "Manual review before launch";
  const budget = shouldLaunch ? campaign.budget || "$75-$150/day test budget" : "No paid budget yet";
  const audience = campaign.audience || audienceFromBrand(brandMemory);
  const recommendation = shouldLaunch
    ? `Sponsor this post from the company ad account as a Thought Leader Ad. It clears the score gate and matches the buyer-pain narrative the brand is trying to amplify.`
    : "Do not sponsor this post yet. Find or rewrite a candidate with clearer buyer pain, proof, ICP fit, and sales usefulness.";
  const approvalCopy = shouldLaunch
    ? `Hi ${author}, can we sponsor your post (${postUrl}) as a Thought Leader Ad from the ${brand} company ad account? It speaks directly to the buyer pain our paid program is trying to create demand around. We will start with a controlled ${budget}, measure paid engagement and lead quality separately, and pause it if comment quality drops. You keep authorship and control; we just amplify reach to the right buying committee.`
    : "Hold approval request. This candidate does not yet create the buyer-quality conversation we want paid spend to amplify.";

  const measurementRows = [
    "- Save the organic baseline (reactions, comments, shares, and profile clicks) before launch.",
    "- Track paid engagement separately from organic to preserve the signal.",
    "- Tag every paid lead with the post URN so sales sees which conversation the ad started.",
    "- Review comments daily. If they start looking like engagement pods or off-ICP noise, pause immediately.",
    "- Judge the test by opportunity-stage CRM matches, not CPL."
  ].join("\n");

  const checklistRows = [
    `- [ ] Confirm ${author} (${role}) has approved running this post as a Thought Leader Ad.`,
    "- [ ] Verify the company ad account has Thought Leader Ads permission enabled.",
    `- [ ] Paste the UGC post URN (\`${postUrn}\`) into Campaign Manager or the API creative draft.`,
    "- [ ] Exclude current customers, agency audiences, and obvious non-buyers.",
    "- [ ] Set the UTM below on the destination URL if a link card is attached.",
    "- [ ] Schedule a 48-hour post-launch quality review before increasing budget."
  ].join("\n");

  const utm = `utm_source=linkedin&utm_medium=paid_social&utm_campaign=thought_leader_ad&utm_content=${slugify(author)}`;

  return `# Thought Leader Ads Launch Packet

Brand: ${brand}
Author: ${author}${role ? ` (${role})` : ""}
Score: ${score.total || 0}/100 (${score.recommendation || "n/a"})
Generated: ${new Date().toISOString()}

## Recommendation

${recommendation}

## Source Post

- URL: ${postUrl}
- UGC URN: ${postUrn}
- Organic reactions: ${numeric(post.reactions)}
- Organic comments: ${numeric(post.comments)}
- Organic shares: ${numeric(post.shares)}

${post.excerpt ? `> ${post.excerpt}` : ""}

## Recommended Campaign Setup

- Objective: ${objective}
- Format: Match the organic post format (text, image, or video as published)
- Placement: LinkedIn feed only. Do not expand network or audience until quality is proven.
- Budget: ${budget}
- Audience: ${audience}
- Exclusions: Current customers, agencies, competitors, and known non-buyers from the brand audience file.

## UTM And Tracking

\`${utm}\`

Add the post URN as a hidden field on any linked lead form so sales can see which post started the conversation.

## Pre-Launch Checklist

${checklistRows}

## Approval Request Copy

${approvalCopy}

## Measurement Plan

${measurementRows}

## Kill Criteria

- Comments skew off-ICP or look like engagement pods.
- Sales reports the paid leads from this post do not match the promised buyer pain.
- 7 days in, zero opportunity-stage CRM matches despite meaningful spend.

Pause first, rewrite before relaunching.
`;
}

function composeScorecardHeadline({ top, total, tiers }) {
  if (!top || total === 0) return "**Headline:** No candidate posts available to score yet.";
  const { post, score } = top;
  const strength = score.recommendation === "strong_candidate"
    ? "strong"
    : score.recommendation === "test_candidate"
    ? "test-worthy"
    : "manual-review";

  return `**Headline:** Top pick is \`${post.filename || post.author}\` by ${post.author}${post.role ? ` (${post.role})` : ""} at ${score.total}/100 - a ${strength} candidate. Scored ${total} post(s): ${tiers.strong_candidate.length} strong, ${tiers.test_candidate.length} test-worthy, ${tiers.manual_review.length} manual-review.`;
}

function audienceFromBrand(brandMemory = {}) {
  const audience = (brandMemory.audience || "").trim();
  if (audience) {
    const firstLine = audience.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("#"));
    if (firstLine) return firstLine.trim();
  }
  return "Use the ICP in the brand audience file. Target seniority Manager+ at companies >=50 headcount in priority industries.";
}

function slugify(value) {
  return String(value || "post")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "post";
}

function excerptOf(text = "") {
  const flat = String(text).replace(/\s+/g, " ").trim();
  if (flat.length <= 180) return flat;
  return `${flat.slice(0, 177)}...`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
