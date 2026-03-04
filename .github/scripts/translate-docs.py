#!/usr/bin/env python3
"""
Translate English documentation files to Japanese.
Preserves code blocks, links, MDX components, and frontmatter structure.
Requires ANTHROPIC_API_KEY environment variable.

Usage:
  python translate-docs.py <file1.mdx> [file2.mdx ...]
  python translate-docs.py --all  # Translate all docs/jp/ files
"""

import sys
import os
import re
import anthropic

def extract_preservable_blocks(content):
    """Replace code blocks and MDX components with placeholders."""
    placeholders = []
    counter = [0]

    def replace_with_placeholder(match):
        placeholders.append(match.group(0))
        idx = counter[0]
        counter[0] += 1
        return f"__PRESERVE_{idx}__"

    # Preserve fenced code blocks
    content = re.sub(r'```[\s\S]*?```', replace_with_placeholder, content)
    # Preserve inline code
    content = re.sub(r'`[^`\n]+`', replace_with_placeholder, content)
    # Preserve MDX/JSX components (multi-line)
    content = re.sub(r'<[A-Z][^>]*>[\s\S]*?</[A-Z][a-zA-Z]*>', replace_with_placeholder, content)
    # Preserve self-closing MDX components
    content = re.sub(r'<[A-Z][^/]*?/>', replace_with_placeholder, content)
    # Preserve HTML-like tags
    content = re.sub(r'<(?:img|video|iframe|br|hr)[^>]*/?>', replace_with_placeholder, content)
    # Preserve image references
    content = re.sub(r'!\[([^\]]*)\]\([^)]+\)', replace_with_placeholder, content)
    # Preserve link URLs (but translate link text later)
    content = re.sub(r'\[([^\]]*)\]\([^)]+\)', replace_with_placeholder, content)

    return content, placeholders


def restore_preserved_blocks(content, placeholders):
    """Restore preserved blocks from placeholders."""
    for i, block in enumerate(placeholders):
        content = content.replace(f"__PRESERVE_{i}__", block)
    return content


def split_frontmatter(content):
    """Split content into frontmatter and body."""
    match = re.match(r'^(---\s*\n.*?\n---\s*\n)(.*)', content, re.DOTALL)
    if match:
        return match.group(1), match.group(2)
    return "", content


def translate_text(client, text):
    """Translate English text to Japanese using Claude."""
    if not text.strip():
        return text

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": f"""Translate the following English technical documentation text to Japanese.

Rules:
- Translate all prose text to natural Japanese
- Do NOT translate any placeholder tokens like __PRESERVE_0__, __PRESERVE_1__, etc. Keep them exactly as-is
- Do NOT translate brand names (Factory, Droid, GitHub, etc.)
- Do NOT translate technical terms that are commonly kept in English in Japanese tech docs (API, CLI, SDK, MCP, SSO, SCIM, etc.)
- Keep markdown formatting (headers ##, bold **, italic *, lists -, etc.) intact
- Keep the same line structure and paragraph breaks
- Translate heading text after # symbols

Text to translate:
{text}"""
            }
        ]
    )
    return message.content[0].text


def translate_file(client, filepath):
    """Translate a single .mdx file."""
    with open(filepath, 'r') as f:
        content = f.read()

    frontmatter, body = split_frontmatter(content)

    # Extract and preserve code blocks, components, links
    body_with_placeholders, placeholders = extract_preservable_blocks(body)

    # Translate the prose
    translated_body = translate_text(client, body_with_placeholders)

    # Restore preserved blocks
    translated_body = restore_preserved_blocks(translated_body, placeholders)

    # Reassemble
    result = frontmatter + translated_body

    with open(filepath, 'w') as f:
        f.write(result)

    print(f"  Translated: {filepath}")


def main():
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable is required")
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    if len(sys.argv) < 2:
        print("Usage: translate-docs.py <file1.mdx> [file2.mdx ...] | --all")
        sys.exit(1)

    if sys.argv[1] == '--all':
        files = []
        for root, dirs, filenames in os.walk('docs/jp'):
            for fname in filenames:
                if fname.endswith('.mdx'):
                    files.append(os.path.join(root, fname))
        files.sort()
    else:
        files = sys.argv[1:]

    print(f"Translating {len(files)} files...")
    for filepath in files:
        try:
            translate_file(client, filepath)
        except Exception as e:
            print(f"  Error translating {filepath}: {e}")

    print("Done.")


if __name__ == '__main__':
    main()
