const express = require('express');
const router = express.Router();
const db = require('../database');
const { getNextPrime, getStats } = require('../prime');
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

// Check price for an email
router.post('/check-price', checkPriceLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body;
  
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
  
  // Check for Mars reservation (prime 421)
  if (email.toLowerCase() === 'elon@spacex.com' || 
      email.toLowerCase() === 'elon@tesla.com' || 
      email.toLowerCase() === 'elon@x.com') {
    // Elon gets prime 421
    const marsReserved = await db.query(
      'SELECT claimed FROM prime_reservations WHERE prime_number = 421'
    );
    
    if (marsReserved.rows.length > 0 && !marsReserved.rows[0].claimed) {
      return res.json({
        success: true,
        prime: 421,
        price: 421,
        special: true,
        message: 'Welcome Elon! Prime 421 awaits you! 🚀'
      });
    }
  }
  
  // Get next available prime
  const nextPrime = await getNextPrime();
  const price = getPrice(nextPrime);
  
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
  
  res.json({
    success: true,
    prime: nextPrime,
    price: price,
    btcPrice: btcPrice,
    btcAmount: btcAmount,
    dogePrice: dogePrice,
    dogeAmount: dogeAmount
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
  const { email } = req.body;
  
  // Validate email
  if (!email || !emailRegex.test(email)) {
    throw new AppError('Valid email address required', 400);
  }
  
  const normalizedEmail = email.toLowerCase().trim();
  
  try {
    // Get next prime
    const nextPrime = await getNextPrime();
    
    // Check if already claimed
    const existing = await db.query(
      'SELECT prime_number, payment_status FROM prime_claims WHERE email = $1',
      [normalizedEmail]
    );
    
    if (existing.rows.length > 0 && existing.rows[0].payment_status === 'paid') {
      return res.json({
        success: false,
        message: 'This email already owns a prime',
        prime: existing.rows[0].prime_number
      });
    }
    
    // Create Bitcoin payment
    const bitcoinPayment = await createBitcoinPayment(nextPrime, normalizedEmail);
    
    // Reserve the prime with Bitcoin payment ID
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO prime_claims 
         (prime_number, email, payment_status, bitcoin_payment_id, claimed_at) 
         VALUES ($1, $2, 'pending', $3, NOW())
         ON CONFLICT (email) 
         DO UPDATE SET bitcoin_payment_id = $3, claimed_at = NOW()`,
        [nextPrime, normalizedEmail, bitcoinPayment.paymentId]
      );
    });
    
    res.json({
      success: true,
      ...bitcoinPayment,
      prime: nextPrime,
      paymentMethod: 'bitcoin'
    });
    
  } catch (error) {
    logger.error('Bitcoin payment creation error:', error);
    throw new AppError('Failed to create Bitcoin payment', 500);
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