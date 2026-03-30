import duckdb from 'duckdb';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  console.log("=== Initializing DuckDB Freeze Registry ===");
  const dbPath = 'QuantLab/registry/audit_trail.duckdb';
  const sqlPath = 'schemas/freeze_registry.sql';
  
  try {
    // 1. Ensure absolute directory exists Node Node node Node
    const absoluteDbPath = path.resolve(dbPath);
    const absoluteSqlPath = path.resolve(sqlPath);
    await fs.mkdir(path.dirname(absoluteDbPath), { recursive: true });
    
    console.log(`Creating database at: ${absoluteDbPath}`);
    const db = new duckdb.Database(absoluteDbPath);
    const sql = await fs.readFile(absoluteSqlPath, 'utf8');

    db.exec(sql, (err) => {
      if (err) {
          console.error("❌ SQL Execution failed:", err);
          process.exit(1);
      }
      console.log("✅ DuckDB Freeze Registry initialized successfully.");
      
      // 2. Verify tables Node Node node Node
      db.all("SELECT table_name FROM information_schema.tables WHERE table_schema='main'", (err, rows) => {
          if (err) {
            console.error("❌ Verification failed:", err);
          } else {
            console.log("\nCreated Tables:");
            rows.forEach(r => console.log(` - ${r.table_name}`));
          }
          db.close();
      });
    });

  } catch (err) {
    console.error("❌ Execution error:", err);
    process.exit(1);
  }
}

main();
