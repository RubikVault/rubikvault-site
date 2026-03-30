import os
import glob
import gzip
import json
import requests
import subprocess
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

DATA_DIR = 'public/data/v3/series/adjusted_all'

def get_api_key():
    path = os.path.expanduser('~/Desktop/EHDHD_API_KEY.env.rtf')
    if not os.path.exists(path):
        return None
    try:
        res = subprocess.run(['textutil', '-convert', 'txt', path, '-stdout'], capture_output=True, text=True)
        text = res.stdout.strip()
        lines = text.split('\n')
        key = None
        for line in lines:
            if '=' in line:
                key = line.split('=')[1].strip()
                break
        if not key:
             key = text.split()[0]
        return key.replace('"', '').replace("'", "")
    except:
        return None

def process_file(file_path, api_token):
    filename = os.path.basename(file_path)
    safe_id = filename.replace('.ndjson.gz', '')
    parts = safe_id.split('__')
    ticker = f"{parts[1]}.{parts[0]}" if len(parts) == 2 else safe_id
    
    last_date = None
    current_rows = []
    
    try:
        with gzip.open(file_path, 'rt', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                     row = json.loads(line)
                     current_rows.append(row)
                     last_date = row.get('date')
    except Exception as e:
        return f"[{ticker}] Read error: {e}"
        
    if not last_date:
        return f"[{ticker}] No date"
        
    url = f"https://eodhd.com/api/eod/{ticker}?from={last_date}&api_token={api_token}&fmt=json"
    
    try:
         res = requests.get(url, timeout=10)
         if res.status_code == 200:
              new_bars = res.json()
              added = 0
              if not isinstance(new_bars, list):
                   return f"[{ticker}] Non-list payout"
                   
              for bar in new_bars:
                   b_date = bar.get('date')
                   if b_date and b_date > last_date:
                        mapped = {
                            'close': bar.get('adjusted_close') or bar.get('close'),
                            'high': bar.get('high'),
                            'low': bar.get('low'),
                            'volume': bar.get('volume'),
                            'date': b_date
                        }
                        current_rows.append(mapped)
                        added += 1
                        
              if added > 0:
                   with gzip.open(file_path, 'wt', encoding='utf-8') as f:
                        for r in current_rows:
                             f.write(json.dumps(r) + '\n')
                   return f"[{ticker}] Added {added} bars"
              return f"[{ticker}] No new bars"
         elif res.status_code == 404:
              return f"[{ticker}] 404 Not Found"
         else:
              return f"[{ticker}] HTTP {res.status_code}"
    except Exception as e:
         return f"[{ticker}] Error: {e}"

def main():
    api_token = get_api_key()
    if not api_token:
        print("API Key not found.")
        return
        
    files = glob.glob(os.path.join(DATA_DIR, '*.ndjson.gz'))
    if not files:
        print(f"No files found in {DATA_DIR}")
        return
        
    print(f"Syncing {len(files)} tickers using ThreadPool (Max 10 threads)...")
    
    success_count = 0
    error_count = 0
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_file = {executor.submit(process_file, f, api_token): f for f in files}
        
        for i, future in enumerate(as_completed(future_to_file)):
             res_str = future.result()
             if "Added" in res_str:
                  success_count += 1
             elif "Error" in res_str or "HTTP" in res_str:
                  error_count += 1
                  
             if (i + 1) % 500 == 0:
                  print(f"Processed {i+1}/{len(files)}... Updated: {success_count}, Errors/Offline: {error_count}")
                  
    print(f"All done. Updated {success_count} files, non-200 responses: {error_count}")

if __name__ == '__main__':
    main()
