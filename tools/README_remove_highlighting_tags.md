# MDX Highlighting Tag Removal Script

This script removes highlighting tags from MDX files while preserving their content.

## Tags Removed

The script removes the following tags:
- `<span className="addition">new text</span>` → `new text` (tag removed, content preserved)
- `<span className="deletion">old text</span>` → `` (tag AND content deleted)
- `<span className="change">modified text</span>` → `modified text` (tag removed, content preserved)
- `<div className="change">content</div>` → `content` (tag removed, content preserved)

**Important:** Deletion tags (`className="deletion"`) remove both the tag AND its content, as they mark text that should be deleted from the document.

## Usage

### Basic Usage

Run the script from the repository root:

```bash
python3 tools/remove_highlighting_tags.py
```

This will process all MDX files in `fern/versions/*/*.mdx` by default.

### Custom Repository Path

Specify a different repository path:

```bash
python3 tools/remove_highlighting_tags.py /path/to/your/repo
```

### Dry Run Mode

Preview what would be changed without modifying files:

```bash
python3 tools/remove_highlighting_tags.py --dry-run
```

### Custom File Pattern

Use a different glob pattern to find MDX files:

```bash
python3 tools/remove_highlighting_tags.py --pattern "docs/**/*.mdx"
```

### All Options

```bash
python3 tools/remove_highlighting_tags.py [repo_path] [--dry-run] [--pattern PATTERN] [--verbose]
```

**Arguments:**
- `repo_path`: Path to the repository (default: `.` - current directory)
- `--dry-run`: Show what would be changed without modifying files
- `--pattern`: Glob pattern for finding MDX files (default: `fern/versions/*/*.mdx`)
- `--verbose`: Show detailed information about tags found/removed

## Examples

### Test on Sample File

```bash
python3 tools/remove_highlighting_tags.py . --pattern "test_sample.mdx" --dry-run
```

### Process All MDX Files in Repository

```bash
python3 tools/remove_highlighting_tags.py .
```

### Process Specific Version

```bash
python3 tools/remove_highlighting_tags.py . --pattern "fern/versions/v2.0/*.mdx"
```

## Features

- **Nested Tag Handling**: Correctly processes nested highlighting tags
- **Content Preservation**: All content inside tags is preserved (except deletion tags)
- **Whitespace Cleanup**: Automatically cleans up whitespace after tag removal
  - Removes empty lines containing only `<div className="change">` or `</div>` tags
  - Collapses 3+ consecutive blank lines to maximum 1 blank line
  - Preserves indentation, spaces within lines, and code blocks
- **Error Handling**: Continues processing even if individual files fail
- **Clear Logging**: Shows which files were modified and how many tags were removed
- **Dry Run Mode**: Preview changes before applying them
- **Summary Report**: Displays total files processed, modified, and tags removed

## Testing

You can test the script with a sample file:

```bash
# Test in dry-run mode
python3 tools/remove_highlighting_tags.py . --pattern "test_sample.mdx" --dry-run

# Run the actual cleanup
python3 tools/remove_highlighting_tags.py . --pattern "test_sample.mdx"

# Verify the output
cat test_sample.mdx
```

## Output Example

```
Searching for MDX files in: .
Pattern: fern/versions/*/*.mdx
Found 15 MDX file(s)

✓ fern/versions/v1.0/intro.mdx: Removed 3 tag(s)
✓ fern/versions/v1.0/guide.mdx: Removed 7 tag(s)
  fern/versions/v2.0/intro.mdx: No tags found
...

============================================================
Summary:
  Files processed: 15
  Files modified: 8
  Files failed: 0
  Total tags removed: 42
============================================================
```

## GitHub Action Automation

A GitHub Action workflow is available to automate the tag removal process.

### Manual Trigger

You can manually trigger the workflow from the GitHub Actions tab:

1. Go to **Actions** → **Remove Highlighting Tags**
2. Click **Run workflow**
3. Configure the inputs:
   - **repository_path**: Path to repository (default: `.`)
   - **dry_run**: Run in dry-run mode (default: `true`)
   - **pattern**: Glob pattern for MDX files (default: `fern/versions/*/*.mdx`)
   - **verbose**: Show detailed tag information (default: `false`)
4. Click **Run workflow**

**Safety Feature:** The workflow defaults to dry-run mode. You must explicitly set `dry_run` to `false` to make actual changes.

### Scheduled Runs

The workflow is configured to run automatically every Sunday at 2 AM UTC. Scheduled runs:
- Run in **live mode** (not dry-run)
- Process all MDX files matching the default pattern
- Create a pull request if changes are found

### Workflow Behavior

When running in **live mode** (dry_run = false or scheduled):
1. Runs the tag removal script
2. If changes are detected:
   - Creates a new branch with timestamp
   - Commits the changes
   - Creates a pull request with detailed summary
3. PR includes:
   - Before/after statistics
   - List of tags removed
   - Rollback instructions
   - Verification checklist

### Workflow Outputs

The workflow provides detailed logging:
- Files processed count
- Files modified count
- Total tags removed
- Dry-run status

### Testing the Workflow

To test the workflow manually:

1. **Dry-run test** (safe, no changes):
   ```
   Actions → Remove Highlighting Tags → Run workflow
   - dry_run: true
   - Check the workflow logs for summary
   ```

2. **Live test** (creates PR):
   ```
   Actions → Remove Highlighting Tags → Run workflow
   - dry_run: false
   - Review the created PR before merging
   ```

### Workflow File Location

The workflow is defined in `.github/workflows/remove-highlighting-tags.yml`

## Requirements

- Python 3.6 or higher
- No external dependencies (uses only standard library)
