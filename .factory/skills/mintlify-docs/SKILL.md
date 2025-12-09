---
name: mintlify-docs
description: How to edit Mintlify docs in this repo—move pages, wire navigation, add redirects, and run Mintlify locally.
---

# Mintlify docs maintenance

Use this skill when updating Mintlify content (navigation, redirects, page moves) in this repo.

## Core references
- Navigation and structure: https://www.mintlify.com/docs/organize/navigation
- Global settings (docs.json): https://www.mintlify.com/docs/organize/settings
- Pages/frontmatter: https://www.mintlify.com/docs/organize/pages
- Hidden pages/indexing: https://www.mintlify.com/docs/organize/hidden-pages

## Moving a page (best practice)
1) Move the file to the new path (keep filename). Example: `mv docs/onboarding/.../linear.mdx docs/web/integrations/linear.mdx`.
2) Update `docs/docs.json` navigation to point to the new path; remove the old path from nav to avoid duplicates. Pick the right slot (tabs → groups → pages). Use standalone page entries when requested.
3) Add a redirect entry in `docs/docs.json`:
```json
{
  "source": "/old/path",
  "destination": "/new/path"
}
```
4) Fix any in-content links that referenced the old path.
5) If staging a hidden page, omit it from navigation or mark `hidden: true`; adjust `seo.indexing` if needed.

## Adding/adjusting navigation
- Root patterns: choose tabs/groups/dropdowns/products/versions/languages; nest one child type per level.
- Standalone links: add the page path directly in the `pages` array under the target group.
- For persistent external links, use anchors (global anchors require `href`).

## Running Mintlify locally
- Prereq: `npm i -g mint` (or use npx).
- From repo root: `mint dev` (or `npx mintlify dev`) to run the local docs server.
- If upgrading from old configs, `mint upgrade` can regenerate `docs.json` (not usually needed here).

## Checklist before PR
- File moved and content intact.
- Navigation updated to new path only (no duplicates).
- Redirect added from old path → new path.
- Internal links updated.
- If adding external install links, prefer in-app integration entry points when OAuth state tokens are required.
