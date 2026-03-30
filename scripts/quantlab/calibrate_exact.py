import duckdb
import os
import json

FEATURE_ROOT = '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1panel_fullchunk_daily'

def run_exact_calibration():
    print("=== 🔬 Running EXACT SQL Grid Search Calibration ===")
    
    con = duckdb.connect()
    
    # Read ALL parquet files recursively node note Node Node
    path = os.path.join(FEATURE_ROOT, '**', '*.parquet')

    print(f"Sampling exact data from ALL dates...")
    
    try:
        # Load sample into memory Node Note
        con.execute(f"CREATE TABLE features AS SELECT * FROM read_parquet('{path}')")
        
        # Exact SQL Calculation Node Node Node node node codes
        res = con.execute("""
            SELECT 
                FLOOR(buy_votes / 10) * 10 as ql_bracket,
                AVG(forward_return_20d) as avg_return,
                COUNT(*) as count
            FROM features
            WHERE buy_votes IS NOT EXISTS = false
            GROUP BY 1
            ORDER BY 1
        """).fetchall()
        
        print("Exact Results Bracketed:")
        for row in res:
            print(f" Votes Bracket {row[0]}: Avg Return {row[1]:.4f} (n={row[2]})")

    except Exception as e:
         print(f"Exact query loaded sample failed: {e}")

run_exact_calibration()
