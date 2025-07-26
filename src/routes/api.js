const express = require('express');
const router = express.Router();
const db = require('../database');
const { getNextPrime, getStats, getPrimeIndex } = require('../prime');
const { getPrice } = require('../payments');
const { createBitcoinPayment, getBTCPrice, convertUSDToBTC } = require('../bitcoin');
const { createDogePayment, getDOGEPrice, convertUSDToDOGE } = require('../dogecoin');
const { sendPaymentConfirmation } = require('../email');
const { paymentLimiter, checkPriceLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'API is working!' });
});

// Database test endpoint
router.get('/db-test', asyncHandler(async (req, res) => {
  const tables = await db.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  
  // Test prime_claims columns
  const columns = await db.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'prime_claims'
    ORDER BY ordinal_position
  `);
  
  // Test dogecoin_payments columns
  const dogeColumns = await db.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'dogecoin_payments'
    ORDER BY ordinal_position
  `);
  
  res.json({
    success: true,
    tables: tables.rows.map(r => r.table_name),
    prime_claims_columns: columns.rows,
    dogecoin_payments_columns: dogeColumns.rows
  });
}));

// Check if a specific prime is available
router.post('/check-prime', checkPriceLimiter, asyncHandler(async (req, res) => {
  const { prime } = req.body;
  
  if (!prime || !Number.isInteger(prime) || prime < 2) {
    throw new AppError('Invalid prime number', 400);
  }
  
  // Check if it's actually a prime number
  const isPrime = (n) => {
    if (n <= 1) return false;
    if (n <= 3) return true;
    if (n % 2 === 0 || n % 3 === 0) return false;
    for (let i = 5; i * i <= n; i += 6) {
      if (n % i === 0 || n % (i + 2) === 0) return false;
    }
    return true;
  };
  
  if (!isPrime(prime)) {
    return res.json({
      success: false,
      message: `${prime} is not a prime number`
    });
  }
  
  // Check if already claimed or reserved
  const claimed = await db.query(
    'SELECT email, payment_status, expires_at FROM prime_claims WHERE prime_number = $1',
    [prime]
  );
  
  if (claimed.rows.length > 0) {
    const claim = claimed.rows[0];
    
    if (claim.payment_status === 'paid') {
      return res.json({
        success: false,
        available: false,
        message: `Prime ${prime} is already owned`,
        status: claim.payment_status
      });
    } else if (claim.payment_status === 'pending') {
      // Check if it's a temporary reservation or actual payment
      if (claim.expires_at && claim.expires_at > new Date()) {
        // It's a reservation
        return res.json({
          success: false,
          available: false,
          message: `Prime ${prime} is reserved until ${new Date(claim.expires_at).toLocaleString()}`,
          status: 'reserved',
          reserved: true
        });
      } else if (!claim.expires_at) {
        // It's an actual payment attempt
        return res.json({
          success: false,
          available: false,
          message: `Prime ${prime} has a pending payment`,
          status: claim.payment_status
        });
      }
      // If expires_at exists but is in the past, the reservation expired and can be claimed
    }
  }
  
  // Prime is available!
  const price = getPrice(prime);
  const primeIndex = getPrimeIndex(prime);
  
  res.json({
    success: true,
    available: true,
    prime: prime,
    primeIndex: primeIndex,
    price: price,
    message: `Prime ${prime} is available for $${price}`
  });
}));

// Check price for an email
router.post('/check-price', checkPriceLimiter, asyncHandler(async (req, res) => {
  const { email, prime } = req.body;
  
  // Validate email
  if (!email || !emailRegex.test(email)) {
    throw new AppError('Valid email address required', 400);
  }
  
  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if already claimed
  const existing = await db.query(
    'SELECT prime_number, payment_status FROM prime_claims WHERE email = $1',
    [normalizedEmail]
  );
  
  // Log for debugging
  logger.info('Check price:', { 
    email: normalizedEmail, 
    found: existing.rows.length,
    status: existing.rows.length > 0 ? existing.rows[0].payment_status : 'none'
  });
  
  if (existing.rows.length > 0 && existing.rows[0].payment_status === 'paid') {
    return res.json({
      success: false,
      message: 'This email already owns a prime',
      prime: existing.rows[0].prime_number
    });
  }
  
  // If user specified a prime, use that. Otherwise get next available
  let selectedPrime;
  let price;
  
  if (prime) {
    // User wants a specific prime
    if (!Number.isInteger(prime) || prime < 2) {
      throw new AppError('Invalid prime number', 400);
    }
    
    // Check if it's actually prime
    const isPrime = (n) => {
      if (n <= 1) return false;
      if (n <= 3) return true;
      if (n % 2 === 0 || n % 3 === 0) return false;
      for (let i = 5; i * i <= n; i += 6) {
        if (n % i === 0 || n % (i + 2) === 0) return false;
      }
      return true;
    };
    
    if (!isPrime(prime)) {
      return res.json({
        success: false,
        message: `${prime} is not a prime number`
      });
    }
    
    // Check if already claimed or reserved
    const claimCheck = await db.query(
      `SELECT email, payment_status, expires_at 
       FROM prime_claims 
       WHERE prime_number = $1`,
      [prime]
    );
    
    if (claimCheck.rows.length > 0) {
      const claim = claimCheck.rows[0];
      
      if (claim.payment_status === 'paid') {
        return res.json({
          success: false,
          message: `Prime ${prime} is already owned`
        });
      } else if (claim.payment_status === 'pending') {
        // Check if it's a temporary reservation or actual payment
        if (claim.expires_at && claim.expires_at > new Date()) {
          // It's a reservation
          if (claim.email !== normalizedEmail) {
            return res.json({
              success: false,
              message: `Prime ${prime} is reserved until ${new Date(claim.expires_at).toLocaleString()}`
            });
          }
        } else if (!claim.expires_at) {
          // It's an actual payment attempt
          return res.json({
            success: false,
            message: `Prime ${prime} has a pending payment`
          });
        }
        // If expires_at exists but is in the past, the reservation expired and can be claimed
      }
    }
    
    selectedPrime = prime;
    price = getPrice(prime);
  } else {
    // Get next available prime
    selectedPrime = await getNextPrime();
    price = getPrice(selectedPrime);
  }
  
  // Get crypto prices
  let btcPrice = null;
  let btcAmount = null;
  let dogePrice = null;
  let dogeAmount = null;
  
  try {
    const btcConversion = await convertUSDToBTC(price);
    btcPrice = btcConversion.btcPrice;
    btcAmount = btcConversion.btcAmount;
  } catch (err) {
    logger.warn('Failed to get BTC price:', err);
  }
  
  try {
    const dogeConversion = await convertUSDToDOGE(price);
    dogePrice = dogeConversion.dogePrice;
    dogeAmount = dogeConversion.dogeAmount;
  } catch (err) {
    logger.warn('Failed to get DOGE price:', err);
  }
  
  // Create a temporary reservation for 1 hour if this is a specific prime request
  if (prime && selectedPrime) {
    // Create or update reservation in prime_claims
    await db.query(
      `INSERT INTO prime_claims 
       (prime_number, email, payment_status, expires_at, claimed_at)
       VALUES ($1, $2, 'pending', NOW() + INTERVAL '1 hour', NOW())
       ON CONFLICT (prime_number) 
       DO UPDATE SET 
         email = $2,
         payment_status = 'pending',
         expires_at = NOW() + INTERVAL '1 hour',
         claimed_at = NOW()
       WHERE prime_claims.payment_status = 'pending' 
         AND prime_claims.expires_at IS NOT NULL
         AND prime_claims.expires_at < NOW()`,
      [selectedPrime, normalizedEmail]
    );
    
    logger.info(`Created temporary reservation for prime ${selectedPrime} for ${normalizedEmail}`);
  }
  
  // Calculate the prime index (e.g., 7 is the 4th prime)
  const primeIndex = getPrimeIndex(selectedPrime);
  
  res.json({
    success: true,
    prime: selectedPrime,
    primeIndex: primeIndex,
    price: price,
    btcPrice: btcPrice,
    btcAmount: btcAmount,
    dogePrice: dogePrice,
    dogeAmount: dogeAmount,
    isSpecificRequest: !!prime,
    reservedUntil: prime ? new Date(Date.now() + 3600000).toISOString() : null
  });
}));

// Stripe endpoint - DISABLED
router.post('/create-payment/stripe', (req, res) => {
  res.status(503).json({
    success: false,
    message: 'Credit card payments are temporarily unavailable. Please use Bitcoin or Dogecoin.',
    alternatives: ['bitcoin', 'dogecoin']
  });
});

// Create Bitcoin payment
router.post('/create-payment/bitcoin', paymentLimiter, asyncHandler(async (req, res) => {
  const { email, prime } = req.body;
  
  // Validate email
  if (!email || !emailRegex.test(email)) {
    throw new AppError('Valid email address required', 400);
  }
  
  const normalizedEmail = email.toLowerCase().trim();
  
  try {
    // Get prime number - either specified or next available
    let selectedPrime;
    
    if (prime) {
      // Validate specific prime request
      if (!Number.isInteger(prime) || prime < 2) {
        throw new AppError('Invalid prime number', 400);
      }
      
      // Verify it's actually prime
      const isPrime = (n) => {
        if (n <= 1) return false;
        if (n <= 3) return true;
        if (n % 2 === 0 || n % 3 === 0) return false;
        for (let i = 5; i * i <= n; i += 6) {
          if (n % i === 0 || n % (i + 2) === 0) return false;
        }
        return true;
      };
      
      if (!isPrime(prime)) {
        throw new AppError(`${prime} is not a prime number`, 400);
      }
      
      selectedPrime = prime;
    } else {
      selectedPrime = await getNextPrime();
    }
    
    // Check if already claimed by anyone
    const claimedCheck = await db.query(
      'SELECT email, payment_status FROM prime_claims WHERE prime_number = $1',
      [selectedPrime]
    );
    
    if (claimedCheck.rows.length > 0) {
      return res.json({
        success: false,
        message: claimedCheck.rows[0].payment_status === 'paid' 
          ? `Prime ${selectedPrime} is already owned` 
          : `Prime ${selectedPrime} has a pending payment`,
        status: claimedCheck.rows[0].payment_status
      });
    }
    
    // Check if this email already has a paid prime
    const emailCheck = await db.query(
      'SELECT prime_number FROM prime_claims WHERE email = $1 AND payment_status = \'paid\'',
      [normalizedEmail]
    );
    
    if (emailCheck.rows.length > 0) {
      return res.json({
        success: false,
        message: 'This email already owns a prime',
        prime: emailCheck.rows[0].prime_number
      });
    }
    
    // Check if prime is available or reserved by this user
    const primeCheck = await db.query(
      'SELECT email, payment_status, expires_at FROM prime_claims WHERE prime_number = $1',
      [selectedPrime]
    );
    
    if (primeCheck.rows.length > 0) {
      const existingClaim = primeCheck.rows[0];
      
      if (existingClaim.payment_status === 'paid') {
        return res.json({
          success: false,
          message: `Prime ${selectedPrime} is already owned`
        });
      } else if (existingClaim.payment_status === 'pending') {
        // Check if it's a reservation or actual payment
        if (existingClaim.expires_at && existingClaim.expires_at > new Date() && existingClaim.email !== normalizedEmail) {
          // It's someone else's reservation
          return res.json({
            success: false,
            message: `Prime ${selectedPrime} is reserved until ${new Date(existingClaim.expires_at).toLocaleString()}`
          });
        } else if (!existingClaim.expires_at && existingClaim.email !== normalizedEmail) {
          // It's someone else's payment attempt
          return res.json({
            success: false,
            message: `Prime ${selectedPrime} has a pending payment`
          });
        }
      }
      
      // Update existing reservation/claim to pending
      await db.query(
        `UPDATE prime_claims 
         SET payment_status = 'pending', 
             payment_method = 'bitcoin',
             expires_at = NULL,
             claimed_at = NOW()
         WHERE prime_number = $1`,
        [selectedPrime]
      );
    } else {
      // Create new claim
      await db.query(
        `INSERT INTO prime_claims 
         (prime_number, email, payment_status, payment_method, claimed_at)
         VALUES ($1, $2, 'pending', 'bitcoin', NOW())`,
        [selectedPrime, normalizedEmail]
      );
    }
    
    // Then create Bitcoin payment
    const bitcoinPayment = await createBitcoinPayment(selectedPrime, normalizedEmail);
    
    // Update the claim with payment ID
    await db.query(
      `UPDATE prime_claims 
       SET bitcoin_payment_id = $1
       WHERE prime_number = $2`,
      [bitcoinPayment.paymentId, selectedPrime]
    );
    
    res.json({
      success: true,
      ...bitcoinPayment,
      prime: selectedPrime,
      paymentMethod: 'bitcoin'
    });
    
  } catch (error) {
    console.error('Bitcoin payment creation error:', error.message);
    console.error('Full error:', error);
    logger.error('Bitcoin payment creation error:', error);
    throw new AppError(`Failed to create Bitcoin payment: ${error.message}`, 500);
  }
}));

// Check Bitcoin payment status
router.get('/payment-status/bitcoin/:paymentId', asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  
  const result = await db.query(
    `SELECT bp.*, pc.prime_number, pc.email
     FROM bitcoin_payments bp
     JOIN prime_claims pc ON bp.prime_number = pc.prime_number
     WHERE bp.payment_id = $1`,
    [paymentId]
  );
  
  if (result.rows.length === 0) {
    throw new AppError('Payment not found', 404);
  }
  
  const payment = result.rows[0];
  
  res.json({
    success: true,
    status: payment.status,
    prime: payment.prime_number,
    confirmations: payment.confirmations,
    txHash: payment.tx_hash,
    amountBTC: payment.amount_btc,
    amountUSD: payment.amount_usd
  });
}));

// Get statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await getStats();
  
  // Add payment method breakdown
  const paymentBreakdown = await db.query(`
    SELECT 
      COUNT(*) FILTER (WHERE payment_method = 'bitcoin') as bitcoin_payments,
      COUNT(*) FILTER (WHERE payment_method = 'dogecoin') as dogecoin_payments,
      SUM(amount_paid) FILTER (WHERE payment_method = 'bitcoin') as bitcoin_revenue,
      SUM(amount_paid) FILTER (WHERE payment_method = 'dogecoin') as dogecoin_revenue
    FROM prime_claims
    WHERE payment_status = 'paid'
  `);
  
  res.json({
    success: true,
    data: {
      ...stats,
      paymentMethods: paymentBreakdown.rows[0]
    }
  });
}));

// Get payment status for email
router.get('/payment-status/:email', asyncHandler(async (req, res) => {
  const { email } = req.params;
  
  if (!email || !emailRegex.test(email)) {
    throw new AppError('Valid email address required', 400);
  }
  
  const result = await db.query(
    `SELECT prime_number, payment_status, payment_method, amount_paid, paid_at 
     FROM prime_claims 
     WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  
  if (result.rows.length === 0) {
    return res.json({
      success: true,
      status: 'not_found'
    });
  }
  
  const claim = result.rows[0];
  res.json({
    success: true,
    status: claim.payment_status,
    prime: claim.prime_number,
    paymentMethod: claim.payment_method,
    amount: claim.amount_paid,
    paidAt: claim.paid_at
  });
}));

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    features: {
      stripe: false,
      bitcoin: true,
      dogecoin: true
    }
  });
});

// Get current BTC price
router.get('/btc-price', asyncHandler(async (req, res) => {
  try {
    const btcPrice = await getBTCPrice();
    res.json({
      success: true,
      price: btcPrice,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Unable to fetch BTC price'
    });
  }
}));

// Get current DOGE price
router.get('/doge-price', asyncHandler(async (req, res) => {
  try {
    const dogePrice = await getDOGEPrice();
    res.json({
      success: true,
      price: dogePrice,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Unable to fetch DOGE price'
    });
  }
}));

module.exports = router;