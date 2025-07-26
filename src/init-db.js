const db = require('./database');
const fs = require('fs').promises;
const path = require('path');

async function initDatabase() {
  console.log('Checking database tables...');
  
  try {
    // Check if tables exist
    const result = await db.query(`
      SELECT COUNT(*) 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'prime_claims'
    `);
    
    if (result.rows[0].count === '0') {
      console.log('Tables not found, initializing database...');
      
      // Read and execute schema
      const schemaPath = path.join(__dirname, '../scripts/schema.sql');
      const schema = await fs.readFile(schemaPath, 'utf8');
      
      // Split by semicolon and execute each statement
      const statements = schema.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          await db.query(statement);
        }
      }
      
      console.log('Database initialized successfully');
      
      // Insert Robbie's prime 2
      await db.query(`
        INSERT INTO prime_claims (prime_number, email, payment_status, payment_method, amount_paid, claimed_at)
        VALUES (2, 'robbie@theqp.ai', 'paid', 'founder', 2, NOW())
        ON CONFLICT (prime_number) DO NOTHING
      `);
      console.log('Reserved prime 2 for Robbie');
      
    } else {
      console.log('Database tables already exist');
    }
    
    // Verify tables
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('Available tables:', tables.rows.map(r => r.table_name).join(', '));
    
  } catch (err) {
    console.error('Database initialization failed:', err);
    throw err;
  }
}

module.exports = { initDatabase };