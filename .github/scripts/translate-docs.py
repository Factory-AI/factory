#!/usr/bin/env python3
"""
Translate English documentation files to Japanese.
Translates all text including inside MDX components, link text,
frontmatter descriptions, and callouts. Preserves code blocks,
URLs, and component tag structure.

Requires ANTHROPIC_API_KEY environment variable.

Usage:
  python translate-docs.py <file1.mdx> [file2.mdx ...]
  python translate-docs.py --all  # Translate all docs/ja/ files
"""

import sys
import os
import re
import anthropic


def split_frontmatter(content):
    """Split content into frontmatter and body."""
    match = re.match(r'^(---\s*\n)(.*?\n)(---\s*\n)(.*)', content, re.DOTALL)
    if match:
        return match.group(1), match.group(2), match.group(3), match.group(4)
    return "", "", "", content


def translate_frontmatter(client, fm_body):
    """Translate description and sidebarTitle fields in frontmatter."""
    if not fm_body.strip():
        return fm_body

    lines = fm_body.split('\n')
    result = []
    for line in lines:
        # Translate description field
        m = re.match(r'^(description:\s*)(.*)', line)
        if m and m.group(2).strip():
            translated = _translate_chunk(client, m.group(2).strip(),
                "Translate this short description to Japanese. Keep it concise. Output ONLY the translation.")
            result.append(f"{m.group(1)}{translated}")
            continue

        # Translate sidebarTitle field
        m = re.match(r'^(sidebarTitle:\s*)(.*)', line)
        if m and m.group(2).strip():
            translated = _translate_chunk(client, m.group(2).strip(),
                "Translate this short UI label to Japanese. Output ONLY the translation.")
            result.append(f"{m.group(1)}{translated}")
            continue

        result.append(line)

    return '\n'.join(result)


def translate_body(client, body):
    """Translate body content, preserving code blocks and translating everything else."""
    if not body.strip():
        return body

    # Split content into code blocks and non-code segments
    parts = re.split(r'(```[\s\S]*?```)', body)

    translated_parts = []
    for i, part in enumerate(parts):
        # Odd indices are code blocks - preserve them
        if i % 2 == 1:
            translated_parts.append(part)
            continue

        # Even indices are prose - translate them
        if not part.strip():
            translated_parts.append(part)
            continue

        translated_parts.append(translate_prose_segment(client, part))

    return ''.join(translated_parts)


def translate_prose_segment(client, text):
    """Translate a prose segment (no code blocks) to Japanese."""
    if not text.strip():
        return text

    lines = text.split('\n')
    # For small texts, translate in one shot
    if len(lines) <= 200:
        return _translate_prose(client, text)

    # Split into chunks at paragraph boundaries
    chunks = []
    current = []
    for line in lines:
        current.append(line)
        if len(current) >= 150 and line.strip() == '':
            chunks.append('\n'.join(current))
            current = []
    if current:
        chunks.append('\n'.join(current))

    translated = []
    for i, chunk in enumerate(chunks):
        print(f"    Translating chunk {i+1}/{len(chunks)}...")
        translated.append(_translate_prose(client, chunk))

    return '\n'.join(translated)


def _translate_prose(client, text):
    """Translate prose text with full context about what to translate."""
    return _translate_chunk(client, text, """Translate the following English technical documentation (MDX/Markdown) to Japanese.

CRITICAL RULES:
1. Translate ALL prose text to natural Japanese, including:
   - Paragraph text
   - Heading text (after #, ##, ### etc.)
   - List item text
   - Text inside MDX components like <Tip>, <Note>, <Warning>, <Info>, <Check>, <Card>, <Step>, <Accordion>
   - Link display text: translate [Display Text](/path) to [翻訳テキスト](/path) — keep the URL unchanged
   - Text in component attributes like title="..." and description="..." — translate the attribute values
   - Table cell text (translate content, keep | separators)
   - Bold and italic text content

2. Do NOT translate:
   - Code inside backticks (`code`) — keep exactly as-is
   - URLs and file paths
   - Brand names: Factory, Droid, GitHub, GitLab, Linear, Slack, Discord, Sentry, PagerDuty, Jira, Notion
   - Technical terms commonly kept in English in Japanese tech docs: API, CLI, SDK, MCP, SSO, SCIM, BYOK, IDE, JSON, YAML, MDX, PR, CI/CD, OAuth, OTEL, LLM
   - Component tag names: <Card>, <Step>, <Tip>, etc.
   - Property/attribute names: title=, description=, href=, icon=
   - Import statements and JSX expressions in { }

3. Keep ALL markdown and MDX formatting exactly intact:
   - Headers (#, ##, ###)
   - Bold (**text**), italic (*text*)
   - Lists (-, 1.)
   - Links [text](url) — translate text, keep url
   - Images ![alt](src) — translate alt text, keep src
   - MDX component tags and structure
   - Line breaks and paragraph structure

4. For links pointing to English docs paths, update them to Japanese paths:
   - [text](/cli/overview) → [翻訳テキスト](/ja/cli/overview)
   - [text](/guides/foo) → [翻訳テキスト](/ja/guides/foo)
   - External URLs (https://...) stay unchanged

5. Output ONLY the translated text. No preamble, no explanation, no wrapping.""")


def _translate_chunk(client, text, system_prompt):
    """Translate a single chunk of text using Claude."""
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=16384,
        messages=[
            {
                "role": "user",
                "content": f"""{system_prompt}

Text to translate:
{text}"""
            }
        ]
    )
    return message.content[0].text


def translate_file(client, filepath):
    """Translate a single .mdx file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    fm_open, fm_body, fm_close, body = split_frontmatter(content)

    # Translate frontmatter fields (description, sidebarTitle)
    if fm_body:
        fm_body = translate_frontmatter(client, fm_body)

    # Translate body content
    translated_body = translate_body(client, body)

    # Reassemble
    result = fm_open + fm_body + fm_close + translated_body

    with open(filepath, 'w', encoding='utf-8') as f:
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
        for root, dirs, filenames in os.walk('docs/ja'):
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
