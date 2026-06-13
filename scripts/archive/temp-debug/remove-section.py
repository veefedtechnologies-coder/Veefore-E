#!/usr/bin/env python3
import sys

# Read the file
with open('client/src/pages/Landing.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start: line with "How VeeFore Works - Ascending Graph Section"
# Find the end: the </section> that closes it
start_idx = None
end_idx = None
section_depth = 0

for i, line in enumerate(lines):
    if 'How VeeFore Works - Ascending Graph Section' in line:
        start_idx = i
        print(f"Found start at line {i+1}")
        continue
    
    if start_idx is not None and end_idx is None:
        # Count section tags to find the matching close
        if '<section' in line:
            section_depth += 1
            print(f"Line {i+1}: Found <section>, depth={section_depth}")
        if '</section>' in line:
            if section_depth == 0:
                end_idx = i
                print(f"Found matching </section> at line {i+1}")
                break
            else:
                section_depth -= 1
                print(f"Line {i+1}: Found </section>, depth={section_depth}")

if start_idx is not None and end_idx is not None:
    # Keep everything before start_idx and after end_idx
    new_lines = lines[:start_idx] + lines[end_idx+1:]
    
    with open('client/src/pages/Landing.tsx', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print(f"\nSuccess! Removed lines {start_idx+1} to {end_idx+1} ({end_idx - start_idx + 1} lines)")
    print(f"Original: {len(lines)} lines, New: {len(new_lines)} lines")
else:
    print(f"Error: Could not find section boundaries")
    print(f"Start: {start_idx}, End: {end_idx}")
    sys.exit(1)
