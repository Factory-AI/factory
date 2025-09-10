#!/bin/bash

# Script to convert all .md files to .mdx (excluding README.md)
# Usage: ./convert_md_to_mdx.sh

# Find all .md files, excluding README.md
md_files=$(find . -name "*.md" | grep -v "README.md")

# Count the files
total_files=$(echo "$md_files" | wc -l)
echo "Found $total_files .md files to convert to .mdx"

# Convert each file
count=0
for file in $md_files; do
    # Create the new filename with .mdx extension
    new_file="${file%.md}.mdx"
    
    # Rename the file
    mv "$file" "$new_file"
    
    # Increment counter
    count=$((count + 1))
    
    # Display progress
    echo "[$count/$total_files] Converted: $file → $new_file"
done

echo "Conversion complete! All $count files have been converted from .md to .mdx"
