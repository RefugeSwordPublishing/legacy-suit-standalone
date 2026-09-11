# GuildWright brand spec

Working brand, locked 2026-07-27. Direction 3 (Plumb Line), with refinements.

## Concept
A "wright" is a skilled maker; a "guild" is the crew that builds together. The
mark is the plumb line: true, level, honest work. Rendered as an engraved
maker's stamp, not a literal tool illustration.

## Logo / icon
- An engraved brass plumb-bob emblem where the negative space forms a **G**,
  set in a subtle shield / maker's stamp, square proportions.
- Must scale to all of: 16px favicon, 32px toolbar, embroidered shirt, laser-
  engraved tape measure, truck-door vinyl, app icon. If it fails any of those,
  it is too detailed.
- The **app/favicon icon is a flat two-color mark** (Aged Brass on Forge Black),
  clean geometry, 2px strokes. The ornate 3D brass render is a splash/marketing
  asset only, it does not scale down.

## Color palette
| Name | Hex | Use |
|---|---|---|
| Forge Black | #262525 | Primary text, nav, dark UI |
| Aged Brass | #B58A45 | Buttons, highlights, the icon |
| Walnut | #6B4B32 | Secondary accents |
| Limestone | #F5F2EA | Light backgrounds |
| Deep Spruce | #355848 | Success, links, selected states |

The feel: old drafting tables, brass squares, oak workbenches, waxed canvas,
graphite pencils. Not bright software blue.

## Typography
- **Wordmark / headings:** Fraunces (contemporary revival serif, strong G and W).
  Optional custom tweaks: wider G, custom W, slightly shortened t crossbar.
- **UI / body:** Inter. Clean, highly legible on a phone in sunlight.

Interface stays modern and effortless (white space, clean cards, charcoal type,
subtle brass accent). The branding carries the craftsmanship, not the UI chrome.

## Icon style
Every icon should look stamped into steel: 2px strokes, square corners, slight
chamfers, geometric proportions. Even the checkmark should feel engineered.

## Taglines
Primary: **One System. Every Job.**
Alternates: Right Work. Every Day. · Built by Trades. Made for Trades. ·
The Job Runs Better Here. · From Estimate to Invoice.

## Applying it
These values become the defaults in `company_settings` (brand_primary =
Forge Black, brand_accent = Aged Brass) and the app theme tokens, wired during
the reskin. Per-tenant branding overrides these; this is GuildWright's own house
brand and tenant zero's default.
