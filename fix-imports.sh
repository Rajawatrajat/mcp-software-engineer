#!/bin/bash

# Fix fs-extra imports in all tool files
for file in src/tools/backend.ts src/tools/database.ts src/tools/deployment.ts src/tools/git.ts src/tools/testing.ts; do
  echo "Fixing imports in $file"
  # Use sed to replace the import statement
  sed -i '' "s/import \* as fs from 'fs-extra'/import fs from 'fs-extra'/g" "$file"
  sed -i '' "s/import \* as path from 'path'/import path from 'path'/g" "$file"
done

echo "All imports fixed!"
