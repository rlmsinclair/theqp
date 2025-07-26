const db = require('./database');
const logger = require('./utils/logger');

// Efficient prime checking using Miller-Rabin primality test
function isPrime(n) {
  if (n < 2) return false;
  if (n === 2 || n === 3) return true;
  if (n % 2 === 0) return false;
  
  // Write n-1 as 2^r * d
  let d = n - 1;
  let r = 0;
  while (d % 2 === 0) {
    d /= 2;
    r++;
  }
  
  // Witnesses to test
  const witnesses = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
  
  for (const a of witnesses) {
    if (a >= n) continue;
    
    let x = modPow(a, d, n);
    if (x === 1 || x === n - 1) continue;
    
    let composite = true;
    for (let i = 0; i < r - 1; i++) {
      x = (x * x) % n;
      if (x === n - 1) {
        composite = false;
        break;
      }
    }
    
    if (composite) return false;
  }
  
  return true;
}

// Get the index of a prime (e.g., 7 is the 4th prime, so returns 4)
function getPrimeIndex(prime) {
  if (!isPrime(prime)) return null;
  
  let count = 0;
  for (let i = 2; i <= prime; i++) {
    if (isPrime(i)) {
      count++;
      if (i === prime) return count;
    }
  }
  return null;
}

// Modular exponentiation
function modPow(base, exp, mod) {
  let result = 1;
  base = base % mod;
  
  while (exp > 0) {
    if (exp % 2 === 1) {
      result = (result * base) % mod;
    }
    exp = Math.floor(exp / 2);
    base = (base * base) % mod;
  }
  
  return result;
}

// Get the next available prime number
async function getNextPrime() {
  try {
    const result = await db.query(
      'SELECT MAX(prime_number) as max_prime FROM prime_claims'
    );
    
    let candidate = BigInt(result.rows[0].max_prime || 1) + 1n;
    
    // Skip even numbers (except 2)
    if (candidate > 2n && candidate % 2n === 0n) {
      candidate++;
    }
    
    // Find next prime that isn't reserved
    while (true) {
      if (isPrime(Number(candidate))) {
        // Check if this prime is reserved (and not expired)
        const reserved = await db.query(
          'SELECT 1 FROM prime_reservations WHERE prime_number = $1 AND expires_at > NOW()',
          [Number(candidate)]
        );
        
        if (reserved.rows.length === 0) {
          // Not reserved, we can use it
          return Number(candidate);
        }
      }
      
      candidate += (candidate === 2n) ? 1n : 2n; // Only check odd numbers after 2
    }
  } catch (err) {
    logger.error('Error getting next prime:', err);
    throw err;
  }
}

// Get statistics
async function getStats() {
  try {
    const [claimed, verified, paid, recent] = await Promise.all([
      db.query('SELECT COUNT(*) FROM prime_claims'),
      db.query('SELECT COUNT(*) FROM prime_claims WHERE verified = true'),
      db.query('SELECT COUNT(*) FROM prime_claims WHERE payment_status = \'paid\''),
      db.query(`
        SELECT prime_number, claimed_at, amount_paid
        FROM prime_claims 
        WHERE payment_status = 'paid'
        ORDER BY claimed_at DESC 
        LIMIT 10
      `)
    ]);
    
    const nextPrime = await getNextPrime();
    
    return {
      claimed: parseInt(claimed.rows[0].count),
      verified: parseInt(verified.rows[0].count),
      paid: parseInt(paid.rows[0].count),
      nextPrime,
      recentClaims: recent.rows.map(row => ({
        prime: row.prime_number,
        claimedAt: row.claimed_at,
        amount: row.amount_paid
      }))
    };
  } catch (err) {
    logger.error('Error getting stats:', err);
    throw err;
  }
}

// Reserve a prime for payment
async function reservePrime(email, paymentIntentId) {
  return db.transaction(async (client) => {
    // Check if email already has a prime
    const existing = await client.query(
      'SELECT prime_number, payment_status FROM prime_claims WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      const claim = existing.rows[0];
      if (claim.payment_status === 'paid') {
        return {
          success: false,
          alreadyClaimed: true,
          prime: claim.prime_number
        };
      }
      // Update existing reservation
      await client.query(
        'UPDATE prime_claims SET payment_intent_id = $1 WHERE email = $2',
        [paymentIntentId, email]
      );
      return {
        success: true,
        prime: claim.prime_number,
        updated: true
      };
    }
    
    // Get and reserve the next prime
    const nextPrime = await getNextPrime();
    
    await client.query(
      `INSERT INTO prime_claims 
       (prime_number, email, payment_intent_id, payment_status, claimed_at) 
       VALUES ($1, $2, $3, 'pending', NOW())`,
      [nextPrime, email, paymentIntentId]
    );
    
    logger.info('Prime reserved', { prime: nextPrime, email });
    
    return {
      success: true,
      prime: nextPrime
    };
  });
}

// Confirm payment and finalize claim
async function confirmPayment(paymentIntentId, amountPaid) {
  try {
    const result = await db.query(
      `UPDATE prime_claims 
       SET payment_status = 'paid', 
           verified = true, 
           paid_at = NOW(),
           amount_paid = $2
       WHERE payment_intent_id = $1 
       RETURNING prime_number, email`,
      [paymentIntentId, amountPaid]
    );
    
    if (result.rows.length === 0) {
      return { success: false };
    }
    
    logger.info('Payment confirmed', { 
      prime: result.rows[0].prime_number, 
      email: result.rows[0].email,
      amount: amountPaid
    });
    
    return {
      success: true,
      prime: result.rows[0].prime_number,
      email: result.rows[0].email
    };
  } catch (err) {
    logger.error('Error confirming payment:', err);
    throw err;
  }
}

// Clean up abandoned reservations (run periodically)
async function cleanupAbandonedReservations() {
  try {
    const result = await db.query(
      `DELETE FROM prime_claims 
       WHERE payment_status = 'pending' 
       AND claimed_at < NOW() - INTERVAL '1 hour'
       RETURNING prime_number`
    );
    
    if (result.rows.length > 0) {
      logger.info('Cleaned up abandoned reservations', { count: result.rows.length });
    }
    
    return result.rows.length;
  } catch (err) {
    logger.error('Error cleaning up reservations:', err);
    throw err;
  }
}

module.exports = {
  getNextPrime,
  getStats,
  reservePrime,
  confirmPayment,
  cleanupAbandonedReservations,
  isPrime,
  getPrimeIndex,
  getPrice: require('./payments').getPrice
};