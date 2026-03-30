import pandas as pd
import glob
import os
import gzip
import json
import sys
import argparse

# Usage: python3 extract_parquet_all.py --max-files 10 --out-dir /path/to/out
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--max-files', type=int, default=None)
    parser.add_argument('--out-dir', type=str, default='public/data/v3/series/adjusted_all')
    args = parser.parse_args()

    # Create isolated output directory
    os.makedirs(args.out_dir, exist_ok=True)

    path = '/Volumes/usbshare1/EODHD-History/from_desktop/EODHD_Data/History/*.parquet'
    files = glob.glob(path)
    
    if not files:
        print("No .parquet files found.")
        return
        
    print(f"Found {len(files)} parquet shards.")
    if args.max_files:
        files = files[:args.max_files]
        print(f"Processing subset of {len(files)} shards.")

    total_extracted_tickers = 0

    for i, file_path in enumerate(files):
        print(f"[{i+1}/{len(files)}] Processing {os.path.basename(file_path)}...")
        try:
            df = pd.read_parquet(file_path)
            
            # Map columns to output format 
            # Output format expects array of items: { close, high, low, volume, date }
            df = df.rename(columns={
                'adjusted_close_raw': 'close',
                'high_raw': 'high',
                'low_raw': 'low',
                'volume_raw': 'volume',
                'date': 'date'
            })
            
            # Group by asset_id (mostly exchange:symbol like KLSE:7108)
            groups = df.groupby('asset_id')
            
            for asset_id, group_df in groups:
                # Format or sanitize asset_id to be safe for filenames
                # E.g. KLSE:7108 -> KLSE__7108
                safe_id = str(asset_id).replace(':', '__')
                out_path = os.path.join(args.out_dir, f"{safe_id}.ndjson.gz")
                
                sorted_group = group_df.sort_values('date')
                rows = sorted_group[['close', 'high', 'low', 'volume', 'date']].to_dict('records')
                
                # Write to custom gzipped ndjson
                with gzip.open(out_path, 'wt', encoding='utf-8') as f:
                    for r in rows:
                        f.write(json.dumps(r) + '\n')
                        
                total_extracted_tickers += 1
                
        except Exception as e:
            print(f"Error processing {file_path}: {e}")

    print(f"Done. Extracted {total_extracted_tickers} groups into {args.out_dir}")

if __name__ == '__main__':
    main()
