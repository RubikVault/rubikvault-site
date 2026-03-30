import os
import glob
import gzip
import json
import requests
import subprocess

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

def main():
    api_token = get_api_key()
    if not api_token:
        print("API Key not found.")
        return
        
    # Pick a few sample files (e.g. KLSE, XNSA, XETRA if they exist, or just first 3)
    files = glob.glob(os.path.join(DATA_DIR, '*.ndjson.gz'))[:3]
    if not files:
        print(f"No files found in {DATA_DIR}")
        return
        
    print(f"Testing with {len(files)} files...")
    
    for file_path in files:
        filename = os.path.basename(file_path)
        safe_id = filename.replace('.ndjson.gz', '')
        parts = safe_id.split('__')
        ticker = f"{parts[1]}.{parts[0]}" if len(parts) == 2 else safe_id
        
        last_date = None
        current_rows = []
        with gzip.open(file_path, 'rt', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                     row = json.loads(line)
                     current_rows.append(row)
                     last_date = row.get('date')
                     
        print(f"[{ticker}] Last Date: {last_date}, Existing bars: {len(current_rows)}")
        
        url = f"https://eodhd.com/api/eod/{ticker}?from={last_date}&api_token={api_token}&fmt=json"
        
        try:
             res = requests.get(url)
             if res.status_code == 200:
                  new_bars = res.json()
                  added = 0
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
                  print(f"[{ticker}] Added {added} new bars. Total bars: {len(current_rows)}")
             else:
                  print(f"[{ticker}] API Error {res.status_code}")
        except Exception as e:
             print(f"[{ticker}] Error: {e}")

if __name__ == '__main__':
    main()
