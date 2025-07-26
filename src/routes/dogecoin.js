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
             payment_method = 'dogecoin',
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
         VALUES ($1, $2, 'pending', 'dogecoin', NOW())`,
        [selectedPrime, normalizedEmail]
      );
    }
    
    // Then create Dogecoin payment
    const dogePayment = await createDogePayment(selectedPrime, normalizedEmail);
    
    // Update the claim with payment ID
    await db.query(
      `UPDATE prime_claims 
       SET dogecoin_payment_id = $1
       WHERE prime_number = $2`,
      [dogePayment.paymentId, selectedPrime]
    );
    
    res.json({
      success: true,
      ...dogePayment,
      prime: selectedPrime,
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