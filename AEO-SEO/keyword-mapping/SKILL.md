# Keyword Mapping & SEO Opportunity Sizing

Description: Map a raw keyword export to a hub & spoke page architecture with 3-scenario booking projections.
When to use:
  - When the user asks to "size keywords", "map keywords", "create SEO projections", or "opportunity sizing"
  - When the user provides a keyword export (Excel/CSV) and wants pages + projections
  - When the user says "run keyword mapping" or "/keyword-mapping"

## Overview

This skill takes a raw keyword dataset and produces:
1. Filtered, intent-based keyword set
2. Hub & spoke page architecture
3. 3-scenario booking projections (Bear / Base / Bull)
4. Master spreadsheet with standardized tabs
5. 1-pager strategy summary

## Required Inputs

Before starting, confirm these with the user:

| Input | Required? | Default |
|-------|-----------|---------|
| Keyword export file (Excel/CSV) | YES | - |
| Target market | YES | US |
| Approved inventory list | NO | Include all unless explicitly excluded |
| Exclusion list | NO | None |
| Conversion rate | NO | 1% |
| Go-live month | NO | Next month |
| Capture rate (Base scenario) | NO | 5% |

## Step-by-Step Workflow

### STEP 1: Load & Explore Data

Read the keyword file. Identify columns:
- Keyword (required)
- Volume / Search Volume (required)
- Global Traffic Potential / GTP (optional)
- Difficulty / KD (optional)
- Cluster / Topic (optional)

Print a summary: total keywords, total volume, column names, sample rows.

### STEP 2: Filter Keywords

Filter in stages. After EACH stage, report what was removed and why.

**Default filters (always apply):**
- Navigational/branded queries (users seeking a specific brand/website)
- Pure research queries (history, facts, Wikipedia-style)
- Pop culture queries (movies, TV shows filmed at location)
- Travel-between-destinations ("paris to london", "paris to colmar")

**CRITICAL RULES FOR FILTERING:**

> **RULE: Don't over-filter.** When in doubt, KEEP the keyword and flag it.
> Let the user decide what's relevant to their business.
>
> **RULE: Only exclude what's explicitly excluded.** If the user provides an
> approved inventory list, do NOT treat unlisted items as disapproved.
> Silence ≠ disapproval. Only remove items explicitly marked as excluded.
>
> **RULE: Flag borderline keywords.** Create a separate "Review" list for
> keywords you're unsure about (e.g., ticket keywords, branded attractions).
> Present to user for decision before removing.

**If an exclusion list is provided:**
- Only remove keywords matching items EXPLICITLY on the exclusion list
- Search across: Keyword, Landmark, Cluster, MediumCluster fields
- Report exactly how many keywords were removed per excluded item

After filtering, report:
```
Started with: X keywords
Removed: Y keywords (breakdown by reason)
Final set: Z keywords
```

### STEP 3: Build Page Architecture (Hub & Spoke)

Map keywords to a 3-tier page structure:

**Tier 1: Hub Pages** - Category aggregators
- Target broad, exploratory keywords
- Example: `/food-and-drink` targets "paris food" (exploratory)
- Users browsing, not sure what they want yet

**Tier 2: Spoke Pages** - Specific experience types
- Target specific action keywords
- Example: `/food-and-drink/food-tours` targets "paris food tours" (specific)
- Users know what type of experience they want

**Tier 3: POI Pages** - Individual landmarks/locations
- Target landmark-specific keywords
- Example: `/sightseeing/eiffel-tower` targets "eiffel tower paris"
- Users interested in a specific place

**Mapping rules:**
- Each keyword maps to exactly ONE page (no duplicates)
- Assignment based on: intent > specificity > landmark identification
- Hub = exploratory intent ("paris food")
- Spoke = specific intent ("paris food tours")
- POI = landmark intent ("eiffel tower paris")

**CRITICAL RULE: Think in categories, not URL paths.**
> When grouping pages by category (e.g., "Food & Drink"), think about what
> a human would group together, not what a URL filter catches.
> Example: Dinner cruises are food-related even if they sit under /cruises/.

### STEP 4: Create Projections

**Formula:**
```
Monthly Capture Share = Volume × Capture % × Ramp-up %
Monthly Bookings = Capture Share × Conversion Rate
```

**Three Scenarios:**
- **Bull (10% capture):** Aggressive - strong rankings, high visibility
- **Base (5% capture):** Realistic - average performance (USE THIS as headline)
- **Bear (1% capture):** Conservative - slow ramp, competitive challenges

**Default Ramp-up Schedule (5 months):**
- Month 1: 10% (pages just launched)
- Month 2: 25% (gaining traction)
- Month 3: 50% (rankings improving)
- Month 4: 75% (strong presence)
- Month 5: 100% (full optimization)

**CRITICAL RULES FOR PROJECTIONS:**

> **RULE: Use Volume, not GTP.** Global Traffic Potential inflates expectations.
> Volume (market-specific searches) keeps projections realistic and defensible.
>
> **RULE: Lead with conservative, show the ceiling.** Use Base scenario as
> the headline number. Show GTP gap as a "note on upside potential" —
> never let the aggressive number be the one people anchor to.
>
> **RULE: Always show the Volume vs GTP gap.** Calculate the multiplier
> so stakeholders understand the upside without over-committing.

### STEP 5: Generate Spreadsheet

Create an Excel file with these standardized tabs:

1. **SUMMARY_Projection** - Month-by-month bookings by scenario (all 3)
2. **All_Pages_Summary** - All pages ranked by volume with:
   - Target_Page, Hub_Page, Page_Category
   - Num_Keywords, Total_Volume, Total_GTP
   - Primary_Keyword, Primary_Volume
3. **POI_Pages** - Landmark pages only (if applicable)
4. **All_Keywords_by_Page** - Every keyword with its page assignment
5. **Page_Projections_Detail** - Per-page projections by scenario and month

### STEP 6: Generate 1-Pager Summary

Create a markdown summary document with:
- What This Is (3 bullet points)
- Spreadsheet Structure (tab descriptions)
- Methodology (4 sections: filtering, architecture, mapping, projections)
- Key Facts & Numbers (table + projection table)
- Top Opportunities (top 10 pages, top 5 POIs)
- Recommended Next Steps
- Common Questions (FAQ)
- Global opportunity caveat (Volume vs GTP gap)

**CRITICAL RULE: No horizontal lines.** Do NOT use `---` in documents.
Use headers and whitespace for section separation.

### STEP 7: Validate & Stress-Test

Before presenting results, ask yourself:

1. **Would an exec approve this?** Is the business case complete?
   - What's missing: ROI, investment cost, payback period?
   - Flag these gaps to the user
2. **Are any pages surprisingly empty?** Check for categories with very few keywords
3. **Are exclusions correct?** Only explicitly excluded items removed?
4. **Does the top 10 make sense?** Sanity check the highest-volume pages

## Output Checklist

Before marking complete:
- [ ] Spreadsheet created with all 5 tabs
- [ ] 1-pager summary created (markdown)
- [ ] Filtering breakdown reported (what was removed and why)
- [ ] Volume vs GTP gap calculated and shown
- [ ] 3 scenarios calculated (Bear / Base / Bull)
- [ ] Top 10 pages listed
- [ ] Exclusions documented
- [ ] User reviewed borderline keywords

## Lessons Learned (Hard-Won Rules)

These rules were learned from real client feedback. Do NOT violate them.

### 1. Don't infer exclusions
If something isn't on an approved list, that does NOT mean it's excluded.
Only exclude what is EXPLICITLY marked as excluded. This single mistake
once dropped projections from 510 to 163 bookings — a completely different
story for stakeholders.

### 2. Think in categories, not URL paths
When asked for a category breakout (e.g., "Food & Drink"), include ALL
semantically related pages, not just pages with that term in the URL.
Dinner cruises are food. Walking food tours are food. Think like a human.

### 3. Conservative projections build trust
Use Volume (not GTP) as the basis. Show GTP as upside context.
Under-promise, over-deliver. Stakeholders remember when you overshoot.

### 4. Don't over-filter keywords
When uncertain if a keyword belongs, keep it and flag it. Let the client
decide. Their business context is better than your guess.

### 5. Edit, don't multiply files
Update existing files instead of creating new versions. A trail of
v2, v3, _Final, _Corrected_Final confuses everyone.

### 6. Once shared, don't restructure
After a deliverable is shared with a client, only make additive changes
(new views, breakouts, additional tabs). Don't reorganize what people
are already looking at.

### 7. Always show the gap
Stakeholders want to know: "what are we getting" vs "what's possible."
Always calculate and present both the conservative projection and the
total addressable opportunity.

### 8. Stress-test from the exec perspective
Before delivering, ask: "Would an executive approve a budget based on
this analysis alone?" If not, flag what's missing (ROI, investment,
alternatives, kill criteria).
