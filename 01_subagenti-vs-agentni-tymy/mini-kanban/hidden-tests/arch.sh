#!/usr/bin/env bash
# Architecture checks. Run from the workspace root; prints failures and "arch_passed=N/5".
passed=0
pass() { passed=$((passed + 1)); }

# A1: src/domain exists and does not import React.
if [[ -d src/domain ]] && ! grep -rqE "(from|import|require\()[[:space:]]*['\"]react" src/domain; then
  pass
else
  echo "FAIL A1: src/domain is missing or imports react"
fi

# A2: ARCHITECTURE.md exists and is not empty.
if [[ -s ARCHITECTURE.md ]]; then
  pass
else
  echo "FAIL A2: ARCHITECTURE.md is missing or empty"
fi

# A3: the three layers exist and the domain layer does not depend on the store or the UI.
if [[ -d src/store && -d src/components && -d src/domain ]] \
  && ! grep -rqE "(from|import|require\()[[:space:]]*['\"][^'\"]*(store|components)" src/domain; then
  pass
else
  echo "FAIL A3: src/{domain,store,components} missing, or domain imports store/components"
fi

# A4: localStorage is used inside src/store only (not in the domain or in components).
# The agent's own test files are ignored: they may legitimately reset storage.
test_files=(--exclude='*.test.*' --exclude='*.spec.*')
if grep -rqE "localStorage" src/store "${test_files[@]}" \
  && ! grep -rqE "localStorage" src --exclude-dir=store "${test_files[@]}"; then
  pass
else
  echo "FAIL A4: localStorage is not confined to src/store"
fi

# A5: undo/redo logic lives in the domain layer (src/domain/history.ts) and does not import React.
if [[ -f src/domain/history.ts ]] && ! grep -qE "(from|import|require\()[[:space:]]*['\"]react" src/domain/history.ts; then
  pass
else
  echo "FAIL A5: src/domain/history.ts is missing or imports react"
fi

echo "arch_passed=$passed/5"
