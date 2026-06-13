#!/usr/bin/env python3

# Read the file
with open('client/src/pages/Landing.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find start: line 1451 (index 1450)
# Find end: line just before 2007 (index 2006)
start_idx = 1450  # Line 1451
end_idx = 2006     # Line 2007

# Keep everything before start and from end onwards
new_lines = lines[:start_idx] + lines[end_idx:]

with open('client/src/pages/Landing.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

deleted_count = end_idx - start_idx
print(f"Success! Removed lines {start_idx+1} to {end_idx} ({deleted_count} lines)")
print(f"Original: {len(lines)} lines, New: {len(new_lines)} lines")
