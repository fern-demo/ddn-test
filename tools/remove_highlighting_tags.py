#!/usr/bin/env python3
"""
Script to remove highlighting tags from MDX files.

Removes the following tags while preserving their content:
- <span className="addition">...</span>
- <span className="deletion">...</span>
- <span className="change">...</span>
- <div className="addition">...</div>
- <div className="deletion">...</div>
- <div className="change">...</div>

Note: For deletion tags, both the tag AND content are removed.
"""

import re
import sys
import os
from pathlib import Path
from typing import Tuple, List, Dict


def cleanup_whitespace(content: str) -> str:
    """
    Clean up whitespace after tag removal.

    Rules:
    1. Remove empty lines containing only <div className="..."> or </div>
    2. Collapse 3+ consecutive newlines to 2 newlines (max 1 blank line)

    Args:
        content: The content to clean up

    Returns:
        Content with cleaned whitespace
    """
    # Step 1: Remove lines that contain only <div className="..."> or </div>
    # Match lines with optional whitespace, the tag, and optional whitespace
    lines = content.split('\n')
    cleaned_lines = []

    for line in lines:
        stripped = line.strip()
        # Skip lines that are only opening or closing div tags (any className)
        if (stripped == '<div className="change">' or
            stripped == '<div className="addition">' or
            stripped == '<div className="deletion">' or
            stripped == '</div>'):
            continue
        cleaned_lines.append(line)

    content = '\n'.join(cleaned_lines)

    # Step 2: Collapse 3+ consecutive newlines to 2 newlines (max 1 blank line)
    # This regex matches 3 or more newlines and replaces with exactly 2
    content = re.sub(r'\n{3,}', '\n\n', content)

    return content


def find_highlighting_tags(content: str) -> List[Dict[str, any]]:
    """
    Find all highlighting tags in the content with their line numbers.

    Args:
        content: The MDX file content

    Returns:
        List of dicts with keys: line_number, tag_type, full_tag, content
    """
    found_tags = []

    # Patterns for highlighting tags
    patterns = [
        (r'<span\s+className="addition">(.*?)</span>', 'span className="addition"'),
        (r'<span\s+className="deletion">(.*?)</span>', 'span className="deletion"'),
        (r'<span\s+className="change">(.*?)</span>', 'span className="change"'),
        (r'<div\s+className="addition">(.*?)</div>', 'div className="addition"'),
        (r'<div\s+className="deletion">(.*?)</div>', 'div className="deletion"'),
        (r'<div\s+className="change">(.*?)</div>', 'div className="change"'),
    ]

    # Search through entire content to find all tags (including multi-line)
    for pattern, tag_type in patterns:
        matches = re.finditer(pattern, content, re.DOTALL)
        for match in matches:
            # Find the line number where this match starts
            line_number = content[:match.start()].count('\n') + 1

            found_tags.append({
                'line_number': line_number,
                'tag_type': tag_type,
                'full_tag': match.group(0),
                'content': match.group(1) if match.lastindex >= 1 else ''
            })

    return found_tags


def remove_highlighting_tags(content: str) -> Tuple[str, int]:
    """
    Remove highlighting tags from MDX content.

    For deletion tags, both the tag AND content are removed.
    For other tags (addition, change), only the tag is removed and content is preserved.

    Args:
        content: The MDX file content

    Returns:
        Tuple of (cleaned content, number of tags removed)
    """
    tags_removed = 0

    # Define patterns for tags to remove
    # We need to handle these iteratively to deal with nested tags
    # Note: deletion tags remove both tag AND content (replaced with empty string)
    patterns = [
        (r'<span\s+className="addition">(.*?)</span>', r'\1'),  # Keep content
        (r'<span\s+className="deletion">(.*?)</span>', r''),    # DELETE content
        (r'<span\s+className="change">(.*?)</span>', r'\1'),    # Keep content
        (r'<div\s+className="addition">(.*?)</div>', r'\1'),    # Keep content
        (r'<div\s+className="deletion">(.*?)</div>', r''),      # DELETE content
        (r'<div\s+className="change">(.*?)</div>', r'\1'),      # Keep content
    ]

    # Keep processing until no more tags are found (handles nested tags)
    max_iterations = 100  # Safety limit to prevent infinite loops
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        found_any = False

        for pattern, replacement in patterns:
            # Use DOTALL flag to match across newlines
            matches = re.findall(pattern, content, re.DOTALL)
            if matches:
                found_any = True
                tags_removed += len(matches)
                # Replace tags with their content (or empty string for deletions)
                content = re.sub(pattern, replacement, content, flags=re.DOTALL)

        if not found_any:
            break

    return content, tags_removed


def validate_mdx_basic(content: str) -> bool:
    """
    Perform basic MDX validation.

    Checks for:
    - Balanced highlighting tags (only checks className="addition|deletion|change")
    - Valid UTF-8 encoding (already validated by reading)

    Note: This only validates highlighting tags, not regular HTML tags.
    Regular <div> and <span> tags without className are ignored.

    Args:
        content: The MDX content to validate

    Returns:
        True if validation passes, False otherwise
    """
    # Only check highlighting tags (with className="addition|deletion|change")
    # Count opening highlighting div tags
    opening_divs = len(re.findall(r'<div\s+className="(?:addition|deletion|change)">', content))
    # Count closing div tags that follow highlighting divs
    # We need to be careful here - we'll count all </div> that could close highlighting divs
    # For a more accurate count, we'd need proper parsing, but this is a basic check
    closing_divs = len(re.findall(r'</div>', content))

    # Count opening highlighting span tags
    opening_spans = len(re.findall(r'<span\s+className="(?:addition|deletion|change)">', content))
    # Count closing span tags
    closing_spans = len(re.findall(r'</span>', content))

    # For highlighting tags, we expect exact matches
    # Note: This is a simplified check. In reality, closing tags could belong to other elements.
    # A proper implementation would use a parser, but for our use case this is sufficient.

    # Only validate if we have highlighting tags
    if opening_divs > 0:
        # We can't reliably validate closing divs without a parser since </div> could belong to any div
        # So we'll just check that we have at least as many closing divs as opening highlighting divs
        if closing_divs < opening_divs:
            print(f"Warning: Not enough closing div tags (highlighting divs: {opening_divs}, closing divs: {closing_divs})", file=sys.stderr)
            return False

    if opening_spans > 0:
        # Similar issue with spans - we can only check we have enough closing tags
        if closing_spans < opening_spans:
            print(f"Warning: Not enough closing span tags (highlighting spans: {opening_spans}, closing spans: {closing_spans})", file=sys.stderr)
            return False

    return True


def process_mdx_file(file_path: Path, dry_run: bool = False, verbose: bool = False) -> Tuple[bool, int, List[Dict[str, any]]]:
    """
    Process a single MDX file to remove highlighting tags and clean up whitespace.

    Args:
        file_path: Path to the MDX file
        dry_run: If True, don't write changes to disk
        verbose: If True, show detailed tag information

    Returns:
        Tuple of (success, tags_removed, found_tags)
    """
    try:
        # Read the file
        with open(file_path, 'r', encoding='utf-8') as f:
            original_content = f.read()

        # Validate before processing
        if not validate_mdx_basic(original_content):
            print(f"✗ {file_path}: Failed validation (unbalanced tags)", file=sys.stderr)
            return False, 0, []

        # Find tags before removal (for reporting)
        found_tags = find_highlighting_tags(original_content)

        # Remove tags
        cleaned_content, tags_removed = remove_highlighting_tags(original_content)

        # Clean up whitespace
        cleaned_content = cleanup_whitespace(cleaned_content)

        # Validate after processing
        if not validate_mdx_basic(cleaned_content):
            print(f"✗ {file_path}: Failed validation after processing (unbalanced tags)", file=sys.stderr)
            return False, 0, []

        # Write back if changes were made and not dry run
        if tags_removed > 0 and not dry_run:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(cleaned_content)
            print(f"✓ {file_path}: Removed {tags_removed} tag(s)")
            if verbose and found_tags:
                print(f"  Detailed tags removed:")
                for tag in found_tags[:10]:  # Limit to first 10 for readability
                    content_preview = tag['content'][:50] + '...' if len(tag['content']) > 50 else tag['content']
                    content_preview = content_preview.replace('\n', ' ')
                    print(f"    Line {tag['line_number']}: <{tag['tag_type']}>{content_preview}</{tag['tag_type'].split()[0]}>")
                if len(found_tags) > 10:
                    print(f"    ... and {len(found_tags) - 10} more")
        elif tags_removed > 0:
            print(f"[DRY RUN] {file_path}: Would remove {tags_removed} tag(s)")
            if verbose and found_tags:
                print(f"  Tags that would be removed:")
                for tag in found_tags[:10]:  # Limit to first 10 for readability
                    content_preview = tag['content'][:50] + '...' if len(tag['content']) > 50 else tag['content']
                    content_preview = content_preview.replace('\n', ' ')
                    print(f"    Line {tag['line_number']}: <{tag['tag_type']}>{content_preview}</{tag['tag_type'].split()[0]}>")
                if len(found_tags) > 10:
                    print(f"    ... and {len(found_tags) - 10} more")
        else:
            print(f"  {file_path}: No tags found")

        return True, tags_removed, found_tags

    except Exception as e:
        print(f"✗ Error processing {file_path}: {e}", file=sys.stderr)
        return False, 0, []


def find_mdx_files(root_path: Path, pattern: str = "fern/versions/*/*.mdx") -> list[Path]:
    """
    Find all MDX files matching the pattern.
    
    Args:
        root_path: Root directory to search from
        pattern: Glob pattern for finding MDX files
        
    Returns:
        List of Path objects for MDX files
    """
    mdx_files = list(root_path.glob(pattern))
    
    # Also check for nested MDX files
    nested_pattern = pattern.replace("*.mdx", "**/*.mdx")
    mdx_files.extend(root_path.glob(nested_pattern))
    
    # Remove duplicates and sort
    mdx_files = sorted(set(mdx_files))
    
    return mdx_files


def main():
    """Main entry point for the script."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Remove highlighting tags from MDX files"
    )
    parser.add_argument(
        "repo_path",
        nargs="?",
        default=".",
        help="Path to the repository (default: current directory)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without modifying files"
    )
    parser.add_argument(
        "--pattern",
        default="fern/versions/*/*.mdx",
        help="Glob pattern for finding MDX files (default: fern/versions/*/*.mdx)"
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Show detailed information about tags found/removed"
    )

    args = parser.parse_args()

    repo_path = Path(args.repo_path)

    if not repo_path.exists():
        print(f"Error: Repository path does not exist: {repo_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Searching for MDX files in: {repo_path}")
    print(f"Pattern: {args.pattern}")
    if args.dry_run:
        print("DRY RUN MODE - No files will be modified")
    if args.verbose:
        print("VERBOSE MODE - Showing detailed tag information")
    print()

    # Find all MDX files
    mdx_files = find_mdx_files(repo_path, args.pattern)

    if not mdx_files:
        print(f"No MDX files found matching pattern: {args.pattern}")
        sys.exit(0)

    print(f"Found {len(mdx_files)} MDX file(s)\n")

    # Process each file
    total_tags_removed = 0
    files_modified = 0
    files_failed = 0
    all_found_tags = []

    for mdx_file in mdx_files:
        success, tags_removed, found_tags = process_mdx_file(mdx_file, args.dry_run, args.verbose)
        if success:
            total_tags_removed += tags_removed
            if tags_removed > 0:
                files_modified += 1
                all_found_tags.extend(found_tags)
        else:
            files_failed += 1

    # Summary
    print(f"\n{'='*60}")
    print(f"Summary:")
    print(f"  Files processed: {len(mdx_files)}")
    print(f"  Files modified: {files_modified}")
    print(f"  Files failed: {files_failed}")
    print(f"  Total tags removed: {total_tags_removed}")
    print(f"{'='*60}")

    if files_failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
