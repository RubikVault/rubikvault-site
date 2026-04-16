#!/bin/bash
# Install Python dependencies on Synology NAS for q1_delta_ingest.
# Run once as the neoboy user via SSH.
# Requires: pip3 available (install Python3 via Synology Package Center first)

set -e
echo "[nas-python] Checking Python3..."
python3 --version

echo "[nas-python] Installing pyarrow (may take several minutes)..."
pip3 install --user pyarrow

echo "[nas-python] Verifying..."
python3 -c "import pyarrow; print('pyarrow', pyarrow.__version__, '— OK')"

echo "[nas-python] Checking pandas (needed by q1 ingest)..."
pip3 install --user pandas

echo "[nas-python] Done. Test with:"
echo "  python3 -c \"import pyarrow, pandas; print('OK')\""
