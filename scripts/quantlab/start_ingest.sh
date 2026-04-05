#!/bin/bash
# background ingest starter
cd /Users/michaelpuchowezki/Dev/rubikvault-site
source quantlab/.venv/bin/activate

echo "Starting Ingest for 400 days in background..."
nohup python scripts/quantlab/refresh_v7_history_from_eodhd.py \
  --from-date 2025-02-15 \
  --allowlist-path public/data/universe/v7/ssot/stocks.max.canonical.ids.json \
  > /Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/logs/historical_ingest.log 2>&1 &

echo "Ingest started with PID $!"
