const db = require('./database');

async function initDatabase() {
  console.log('Checking database tables...');
  
  try {
    // Check if prime_claims table exists
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'prime_claims'
      )
    `);
    
    if (!result.rows[0].exists) {
      console.log('Creating database tables...');
      
      // Create prime_claims table
      await db.query(`
        CREATE TABLE IF NOT EXISTS prime_claims (
          id SERIAL PRIMARY KEY,
          prime_number INTEGER UNIQUE NOT NULL,
          email VARCHAR(255) NOT NULL,
          claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          verified BOOLEAN DEFAULT FALSE,
          verification_token VARCHAR(255),
          verification_expires TIMESTAMP WITH TIME ZONE,
          payment_status VARCHAR(50) DEFAULT 'pending',
          payment_method VARCHAR(50),
          payment_id VARCHAR(255),
          amount_paid DECIMAL(10, 2),
          btc_address VARCHAR(255),
          btc_amount DECIMAL(16, 8),
          btc_txid VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      // Create indexes
      await db.query('CREATE INDEX IF NOT EXISTS idx_prime_claims_email ON prime_claims(email)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_prime_claims_payment_status ON prime_claims(payment_status)');
      
      // Create payment_intents table
      await db.query(`
        CREATE TABLE IF NOT EXISTS payment_intents (
          id SERIAL PRIMARY KEY,
          stripe_payment_intent_id VARCHAR(255) UNIQUE,
          prime_number INTEGER REFERENCES prime_claims(prime_number),
          amount INTEGER NOT NULL,
          currency VARCHAR(10) DEFAULT 'usd',
          status VARCHAR(50),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      // Create bitcoin_payments table
      await db.query(`
        CREATE TABLE IF NOT EXISTS bitcoin_payments (
          id SERIAL PRIMARY KEY,
          payment_id VARCHAR(255) UNIQUE NOT NULL,
          prime_number INTEGER REFERENCES prime_claims(prime_number),
          btc_address VARCHAR(255) NOT NULL,
          btc_amount DECIMAL(16, 8) NOT NULL,
          usd_amount DECIMAL(10, 2) NOT NULL,
          status VARCHAR(50) DEFAULT 'pending',
          confirmations INTEGER DEFAULT 0,
          txid VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          confirmed_at TIMESTAMP WITH TIME ZONE
        )
      `);
      
      console.log('Database tables created successfully');
      
      // Insert Robbie's prime 2
      await db.query(`
        INSERT INTO prime_claims (
          prime_number, email, payment_status, 
          payment_method, amount_paid, verified
        ) VALUES (
          2, 'robbie@theqp.ai', 'paid', 
          'founder', 2, true
        ) ON CONFLICT (prime_number) DO NOTHING
      `);
      console.log('Reserved prime 2 for Robbie');
      
    } else {
      console.log('Database tables already exist');
    }
    
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
}

module.exports = { initDatabase };