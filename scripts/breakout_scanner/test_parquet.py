import pandas as pd
import glob
import os

path = '/Volumes/usbshare1/EODHD-History/from_desktop/EODHD_Data/History/*.parquet'

def main():
    files = glob.glob(path)
    if not files:
        print("No .parquet files found.")
        return
        
    print(f"Found {len(files)} parquet shards.")
    test_file = files[0]
    print(f"Reading sample file: {test_file}")
    
    try:
        df = pd.read_parquet(test_file)
        print("\n=== DataFrame Columns ===")
        print(df.columns.tolist())
        print("\n=== Data Sample ===")
        print(df.head(5))
    except Exception as e:
        print(f"Error reading parquet: {e}")

if __name__ == '__main__':
    main()
