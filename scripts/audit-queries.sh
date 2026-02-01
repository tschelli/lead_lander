#!/bin/bash

# Script to audit SQL queries for proper client_id filtering
# Checks apps/api and apps/worker for queries that might be missing tenant isolation

echo "=== Auditing SQL Queries for client_id Filtering ==="
echo ""

# Find all SQL queries in API
echo "Checking apps/api/src/server.ts..."
grep -n "FROM submissions\|FROM delivery_attempts\|FROM schools\|FROM programs\|FROM campuses" apps/api/src/server.ts | while read line; do
    line_num=$(echo "$line" | cut -d: -f1)
    # Get 10 lines of context around the query
    context=$(sed -n "$((line_num-2)),$((line_num+8))p" apps/api/src/server.ts)

    # Check if client_id appears in the context
    if ! echo "$context" | grep -q "client_id"; then
        echo "⚠️  Potential issue at line $line_num:"
        echo "$context"
        echo "---"
    fi
done

echo ""
echo "Checking apps/worker/src/worker.ts..."
grep -n "FROM submissions\|FROM delivery_attempts" apps/worker/src/worker.ts | while read line; do
    line_num=$(echo "$line" | cut -d: -f1)
    context=$(sed -n "$((line_num-2)),$((line_num+8))p" apps/worker/src/worker.ts)

    if ! echo "$context" | grep -q "client_id"; then
        echo "⚠️  Potential issue at line $line_num:"
        echo "$context"
        echo "---"
    fi
done

echo ""
echo "=== Audit Complete ===="
echo ""
echo "Review any warnings above. Queries should filter by client_id to ensure tenant isolation."
