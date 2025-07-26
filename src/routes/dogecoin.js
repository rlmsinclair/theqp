const express = require('express');
const router = express.Router();
const db = require('../database');
const { getNextPrime } = require('../prime');
const { createDogePayment, checkDogePaymentStatus } = require('../dogecoin');
const { paymentLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Create Dogecoin payment
router.post('/create-payment/dogecoin', paymentLimiter, asyncHandler(async (req, res) => {
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
    
    if (existing.rows.length > 0) {
      // Email already has a prime (paid or pending)
      return res.json({
        success: false,
        message: existing.rows[0].payment_status === 'paid' 
          ? 'This email already owns a prime' 
          : 'This email already has a pending payment',
        prime: existing.rows[0].prime_number,
        status: existing.rows[0].payment_status
      });
    }
    
    // Email doesn't have any prime yet, create new claim
    await db.query(
      `INSERT INTO prime_claims 
       (prime_number, email, payment_status, payment_method, claimed_at)
       VALUES ($1, $2, 'pending', 'dogecoin', NOW())`,
      [nextPrime, normalizedEmail]
    );
    
    // Then create Dogecoin payment (now the foreign key constraint will pass)
    const dogePayment = await createDogePayment(nextPrime, normalizedEmail);
    
    // Update the claim with payment ID
    await db.query(
      `UPDATE prime_claims 
       SET dogecoin_payment_id = $1
       WHERE prime_number = $2`,
      [dogePayment.paymentId, nextPrime]
    );
    
    res.json({
      success: true,
      ...dogePayment,
      prime: nextPrime,
      paymentMethod: 'dogecoin'
    });
    
  } catch (error) {
    console.error('Dogecoin payment creation error:', error.message);
    console.error('Full error:', error);
    logger.error('Dogecoin payment creation error:', error);
    throw new AppError(`Failed to create Dogecoin payment: ${error.message}`, 500);
  }
}));

// Check Dogecoin payment status
router.get('/payment-status/dogecoin/:paymentId', asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  
  const result = await db.query(
    `SELECT dp.*, pc.prime_number, pc.email
     FROM dogecoin_payments dp
     JOIN prime_claims pc ON dp.prime_number = pc.prime_number
     WHERE dp.payment_id = $1`,
    [paymentId]
  );
  
  if (result.rows.length === 0) {
    throw new AppError('Payment not found', 404);
  }
  
  const payment = result.rows[0];
  
  // Check current status on blockchain
  const currentStatus = await checkDogePaymentStatus(payment.address, payment.amount_doge);
  
  res.json({
    success: true,
    status: payment.status,
    prime: payment.prime_number,
    confirmations: payment.confirmations || currentStatus.confirmations || 0,
    txHash: payment.tx_hash,
    amountDOGE: payment.amount_doge,
    amountUSD: payment.amount_usd,
    isMemeNumber: payment.is_meme_amount,
    currentBalance: currentStatus.amountReceived || 0
  });
}));

module.exports = router;