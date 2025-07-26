const db = require('./database');

async function initDatabase() {
  console.log('Starting database initialization...');
  
  try {
    console.log('Querying information_schema...');
    // Check if prime_claims table exists
    const result = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'prime_claims'
      )
    `);
    
    console.log('Table exists check result:', result.rows[0]);
    
    if (!result.rows[0].exists) {
      console.log('Tables do not exist, creating...');
      
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
      
      // Create prime_reservations table
      await db.query(`
        CREATE TABLE IF NOT EXISTS prime_reservations (
          id SERIAL PRIMARY KEY,
          prime_number INTEGER UNIQUE NOT NULL,
          reserved_for VARCHAR(255) NOT NULL,
          reason TEXT,
          special_price DECIMAL(10, 2),
          display_message TEXT,
          expires_condition VARCHAR(50) DEFAULT 'NEVER',
          claimed BOOLEAN DEFAULT FALSE,
          claimed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      // Create index for prime_reservations
      await db.query('CREATE INDEX IF NOT EXISTS idx_prime_reservations_claimed ON prime_reservations(claimed)');
      
      // Create mars_status_checks table
      await db.query(`
        CREATE TABLE IF NOT EXISTS mars_status_checks (
          id SERIAL PRIMARY KEY,
          ip_address VARCHAR(255),
          user_agent TEXT,
          referrer TEXT,
          checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      
      // Create mars_reservation_status view
      await db.query(`
        CREATE OR REPLACE VIEW mars_reservation_status AS
        SELECT 
          pr.prime_number,
          pr.reserved_for,
          pr.created_at,
          pr.claimed,
          pr.claimed_at,
          pc.email as claimed_by_email,
          pc.payment_status
        FROM prime_reservations pr
        LEFT JOIN prime_claims pc ON pr.prime_number = pc.prime_number
        WHERE pr.prime_number = 421
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
      
      // Insert Mars reservation for Elon
      await db.query(`
        INSERT INTO prime_reservations (
          prime_number, reserved_for, reason, special_price, 
          display_message, expires_condition
        ) VALUES (
          421, 'Elon Musk', 'Reserved for when Mars is ready for humans', 
          421, 'Reserved exclusively for Elon Musk 🚀', 'NEVER'
        ) ON CONFLICT (prime_number) DO NOTHING
      `);
      console.log('Reserved prime 421 for Elon');
      
    } else {
      console.log('Database tables already exist');
      
      // Check for prime_reservations table specifically
      const reservationsCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'prime_reservations'
        )
      `);
      
      if (!reservationsCheck.rows[0].exists) {
        console.log('Creating missing prime_reservations table...');
        
        await db.query(`
          CREATE TABLE IF NOT EXISTS prime_reservations (
            id SERIAL PRIMARY KEY,
            prime_number INTEGER UNIQUE NOT NULL,
            reserved_for VARCHAR(255) NOT NULL,
            reason TEXT,
            special_price DECIMAL(10, 2),
            display_message TEXT,
            expires_condition VARCHAR(50) DEFAULT 'NEVER',
            claimed BOOLEAN DEFAULT FALSE,
            claimed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);
        
        await db.query('CREATE INDEX IF NOT EXISTS idx_prime_reservations_claimed ON prime_reservations(claimed)');
        console.log('prime_reservations table created');
      }
      
      // Check for mars_status_checks table
      const marsChecksCheck = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'mars_status_checks'
        )
      `);
      
      if (!marsChecksCheck.rows[0].exists) {
        console.log('Creating missing mars_status_checks table...');
        
        await db.query(`
          CREATE TABLE IF NOT EXISTS mars_status_checks (
            id SERIAL PRIMARY KEY,
            ip_address VARCHAR(255),
            user_agent TEXT,
            referrer TEXT,
            checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);
        console.log('mars_status_checks table created');
      }
      
      // Create or replace mars_reservation_status view
      await db.query(`
        CREATE OR REPLACE VIEW mars_reservation_status AS
        SELECT 
          pr.prime_number,
          pr.reserved_for,
          pr.created_at,
          pr.claimed,
          pr.claimed_at,
          pc.email as claimed_by_email,
          pc.payment_status
        FROM prime_reservations pr
        LEFT JOIN prime_claims pc ON pr.prime_number = pc.prime_number
        WHERE pr.prime_number = 421
      `);
      
      // Ensure Mars reservation exists
      await db.query(`
        INSERT INTO prime_reservations (
          prime_number, reserved_for, reason, special_price, 
          display_message, expires_condition
        ) VALUES (
          421, 'Elon Musk', 'Reserved for when Mars is ready for humans', 
          421, 'Reserved exclusively for Elon Musk 🚀', 'NEVER'
        ) ON CONFLICT (prime_number) DO NOTHING
      `);
    }
    
    console.log('Database initialization completed successfully');
    
  } catch (err) {
    console.error('Database initialization error:', err.message);
    console.error('Full error:', err);
    throw err;
  }
}

module.exports = { initDatabase };