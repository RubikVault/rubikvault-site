import subprocess
import requests
import os

def main():
    path = os.path.expanduser('~/Desktop/EHDHD_API_KEY.env.rtf')
    if not os.path.exists(path):
        print("File not found on desktop.")
        return
        
    try:
        # Extract plain text from RTF safely
        res = subprocess.run(['textutil', '-convert', 'txt', path, '-stdout'], capture_output=True, text=True)
        text = res.stdout.strip()
        
        # Typically the key is either on a line with EODHD_API_KEY= or just raw
        lines = text.split('\n')
        key = None
        for line in lines:
            if '=' in line:
                key = line.split('=')[1].strip()
                break
        
        if not key:
             key = text.split()[0] # take first word if flat
             
        # Strip Quotes if present
        key = key.replace('"', '').replace("'", "")
        
        print(f"Key found length: {len(key)}")
        
        # Hit user API
        url = f"https://eodhd.com/api/user?api_token={key}&fmt=json"
        response = requests.get(url)
        if response.status_code == 200:
             data = response.json()
             print("\n=== EODHD API Quota ===")
             import pprint
             # Mask sensitive fields before printing
             safe_data = {k: v for k, v in data.items() if k not in ['api_token', 'password', 'token']}
             pprint.pprint(safe_data)
        else:
             print(f"API Error {response.status_code}: {response.text}")
             
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
