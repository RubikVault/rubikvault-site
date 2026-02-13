#!/bin/bash
# save as: run-audit.sh

set -e  # Exit on error

echo "🔍 Starting CI/CD Workflow Audit..."

# Layer A: Inventory
echo "📋 Layer A: Scanning repository..."
bash -c "$(sed -n '/^## 🔍 LAYER A/,/^## 🏃 LAYER B/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

# Layer B: Reality
echo "🏃 Layer B: Collecting execution evidence..."
bash -c "$(sed -n '/^## 🏃 LAYER B/,/^## 🔗 LAYER C/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

# Layer C: Dependencies
echo "🔗 Layer C: Analyzing dependencies..."
bash -c "$(sed -n '/^## 🔗 LAYER C/,/^## 📊 CLASSIFICATION/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

# Classification
echo "📊 Classifying workflows..."
bash -c "$(sed -n '/^## 📊 CLASSIFICATION/,/^## 🔧 REPAIR/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

# Generate report
echo "📈 Generating final report..."
bash -c "$(sed -n '/^## 📈 FINAL REPORT/,/^## 🚀 USAGE/p' RUNBOOK.md | grep -A 9999 '```bash' | grep -B 9999 '^```$' | grep -v '```')"

echo "✅ Audit complete!"
echo "📄 Report: audit-report/SUMMARY.md"
echo "📁 Evidence: audit-evidence/"
