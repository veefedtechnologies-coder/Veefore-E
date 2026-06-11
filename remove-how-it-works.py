#!/usr/bin/env python3
"""
Precisely delete the old 'How VeeFore Works - Ascending Graph Section'
from Landing.tsx (lines 1451-2007 inclusive)
"""

with open('client/src/pages/Landing.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Original file: {len(lines)} lines")

# Lines to delete: 1451-2007 (inclusive)
# In zero-indexed: 1450-2006 (inclusive)
start_idx = 1450  # Line 1451
end_idx = 2007    # Line 2008 (don't include this line)

# Keep lines before start and from end onwards
new_lines = lines[:start_idx] + lines[end_idx:]

with open('client/src/pages/Landing.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

deleted_count = end_idx - start_idx
print(f"✅ Successfully removed lines {start_idx+1} to {end_idx} ({deleted_count} lines)")
print(f"   Original: {len(lines)} lines → New: {len(new_lines)} lines")
print(f"   Lines removed: {len(lines) - len(new_lines)}")
