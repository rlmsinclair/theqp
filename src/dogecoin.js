const bitcoin = require('bitcoinjs-lib');
const bip32 = require('bip32');
const ecc = require('tiny-secp256k1');
const QRCode = require('qrcode');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./database');

// Initialize BIP32 with secp256k1
const bip32Factory = bip32.BIP32Factory(ecc);

// Dogecoin network configuration
const DOGECOIN_NETWORK = {
  messagePrefix: '\x19Dogecoin Signed Message:\n',
  bech32: 'doge',
  bip32: {
    public: 0x02facafd,
    private: 0x02fac398
  },
  pubKeyHash: 0x1e, // Addresses start with D
  scriptHash: 0x16,
  wif: 0x9e
};

// HD wallet for Dogecoin address generation (lazy initialization)
let hdNode = null;

function getHdNode() {
  if (!hdNode && config.dogecoin.xpub) {
    try {
      hdNode = bip32Factory.fromBase58(config.dogecoin.xpub);
    } catch (err) {
      logger.error('Invalid Dogecoin xpub key:', err.message);
      throw new Error('Dogecoin configuration error: Invalid xpub key');
    }
  }
  return hdNode;
}

// Generate unique Dogecoin address for a prime
function generateDogeAddress(prime) {
  try {
    // Use prime number as derivation index
    const node = getHdNode();
    if (!node) {
      throw new Error('Dogecoin HD node not initialized');
    }
    const child = node.derive(0).derive(prime);
    const { address } = bitcoin.payments.p2pkh({ 
      pubkey: child.publicKey, 
      network: DOGECOIN_NETWORK 
    });
    
    logger.info('Generated Dogecoin address', { prime, address });
    return address;
  } catch (err) {
    logger.error('Error generating Dogecoin address:', err);
    throw err;
  }
}

// Generate QR code for Dogecoin payment
async function generateDogeQRCode(address, amountDOGE) {
  try {
    const dogecoinURI = `dogecoin:${address}?amount=${amountDOGE}&label=TheQP`;
    const qrDataURL = await QRCode.toDataURL(dogecoinURI, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      imageOptions: {
        hideBackgroundDots: true,
        imageSize: 0.4,
        margin: 0
      }
    });
    return qrDataURL;
  } catch (err) {
    logger.error('Error generating Dogecoin QR code:', err);
    throw err;
  }
}

// Get current DOGE/USD price
async function getDOGEPrice() {
  try {
    const sources = [
      {
        name: 'CoinGecko',
        url: 'https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd',
        parser: (data) => data.dogecoin.usd
      },
      {
        name: 'Binance',
        url: 'https://api.binance.com/api/v3/ticker/price?symbol=DOGEUSDT',
        parser: (data) => parseFloat(data.price)
      }
    ];
    
    for (const source of sources) {
      try {
        const response = await axios.get(source.url, { timeout: 5000 });
        const price = source.parser(response.data);
        
        if (price && price > 0) {
          logger.info(`DOGE price from ${source.name}: $${price}`);
          return price;
        }
      } catch (err) {
        logger.warn(`Failed to get DOGE price from ${source.name}:`, err.message);
      }
    }
    
    throw new Error('Unable to fetch DOGE price from any source');
  } catch (err) {
    logger.error('Error getting DOGE price:', err);
    throw err;
  }
}

// Convert USD to DOGE with meme precision
async function convertUSDToDOGE(usdAmount) {
  const dogePrice = await getDOGEPrice();
  let dogeAmount = (usdAmount / dogePrice).toFixed(2);
  
  // Make it meme-worthy if possible
  if (dogeAmount.includes('420')) {
    dogeAmount = dogeAmount; // Already perfect
  } else if (dogeAmount.includes('69')) {
    dogeAmount = dogeAmount; // Nice
  } else {
    // Try to make it end in 420 or 69 without changing value too much
    const base = Math.floor(usdAmount / dogePrice);
    if (base > 100) {
      const memeEndings = ['420.69', '069.42', '420.00', '069.00'];
      for (const ending of memeEndings) {
        const memeAmount = parseInt(base.toString().slice(0, -5) + ending);
        if (Math.abs(memeAmount - (usdAmount / dogePrice)) < 10) {
          dogeAmount = ending.includes('.') ? ending : `${memeAmount}.00`;
          break;
        }
      }
    }
  }
  
  return {
    dogeAmount,
    dogePrice,
    usdAmount,
    isMemeNumber: dogeAmount.includes('420') || dogeAmount.includes('69')
  };
}

// Create Dogecoin payment
async function createDogePayment(prime, email) {
  try {
    const paymentId = uuidv4();
    
    let address;
    try {
      address = generateDogeAddress(prime);
    } catch (addrErr) {
      logger.error('Failed to generate Dogecoin address:', addrErr);
      throw new Error('Failed to generate Dogecoin address');
    }
    
    const conversion = await convertUSDToDOGE(prime);
    const qrCode = await generateDogeQRCode(address, conversion.dogeAmount);
    
    // Store payment request (expires in 30 minutes)
    await db.query(
      `INSERT INTO dogecoin_payments 
       (payment_id, prime_number, email, address, amount_doge, amount_usd, doge_price, status, is_meme_amount, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NOW() + INTERVAL '30 minutes')`,
      [paymentId, prime, email, address, conversion.dogeAmount, prime, conversion.dogePrice, conversion.isMemeNumber]
    );
    
    logger.info('Dogecoin payment created', {
      paymentId,
      prime,
      email,
      address,
      amountDOGE: conversion.dogeAmount,
      amountUSD: prime,
      isMemeNumber: conversion.isMemeNumber
    });
    
    return {
      paymentId,
      address,
      amountDOGE: conversion.dogeAmount,
      amountUSD: prime,
      dogePrice: conversion.dogePrice,
      qrCode,
      isMemeNumber: conversion.isMemeNumber,
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
      memeText: getMemeText()
    };
  } catch (err) {
    logger.error('Error creating Dogecoin payment:', err);
    throw err;
  }
}

// Get random meme text
function getMemeText() {
  const memes = [
    "much prime. very quantum. wow.",
    "such mathematics. many proof. wow.",
    "very identity. much forever. amaze.",
    "so quantum. much resistant. wow.",
    "many prime. such unique. very secure.",
    "wow. much cryptographic. very doge.",
    "such eternal. very prime. moon soon.",
    "1 doge = 1 prime. much value.",
    "to the moon! such prime. wow.",
    "very payment. much identity. hodl."
  ];
  return memes[Math.floor(Math.random() * memes.length)];
}

// Check Dogecoin payment status via blockchain API
async function checkDogePaymentStatus(address, expectedAmount) {
  try {
    // Using Dogechain.info API (no auth required)
    const response = await axios.get(
      `https://dogechain.info/api/v1/address/balance/${address}`,
      { timeout: 10000 }
    );
    
    const data = response.data;
    if (data.success && parseFloat(data.balance) >= parseFloat(expectedAmount)) {
      // Get transaction details
      const txResponse = await axios.get(
        `https://dogechain.info/api/v1/address/transactions/${address}`,
        { timeout: 10000 }
      );
      
      const txData = txResponse.data;
      const latestTx = txData.transactions?.[0];
      
      return {
        paid: true,
        confirmations: latestTx?.confirmations || 0,
        txHash: latestTx?.hash || null,
        amountReceived: parseFloat(data.balance)
      };
    }
    
    return {
      paid: false,
      amountReceived: parseFloat(data.balance) || 0
    };
  } catch (err) {
    logger.error('Error checking Dogecoin payment:', err);
    
    // Fallback to BlockCypher API
    try {
      const fallbackResponse = await axios.get(
        `https://api.blockcypher.com/v1/doge/main/addrs/${address}/balance`,
        { timeout: 10000 }
      );
      
      const balance = fallbackResponse.data.balance / 100000000; // Convert from satoshis
      return {
        paid: balance >= parseFloat(expectedAmount),
        amountReceived: balance
      };
    } catch (fallbackErr) {
      logger.error('Fallback API also failed:', fallbackErr);
      return { paid: false, error: err.message };
    }
  }
}

// Monitor Dogecoin payments
async function monitorDogePayments() {
  try {
    // Get all pending Dogecoin payments
    const pendingPayments = await db.query(
      `SELECT * FROM dogecoin_payments 
       WHERE status = 'pending' 
       AND created_at > NOW() - INTERVAL '2 hours'`
    );
    
    for (const payment of pendingPayments.rows) {
      const status = await checkDogePaymentStatus(payment.address, payment.amount_doge);
      
      if (status.paid) {
        // Update payment status
        await db.query(
          `UPDATE dogecoin_payments 
           SET status = 'confirmed', 
               confirmations = $1,
               tx_hash = $2,
               confirmed_at = NOW()
           WHERE payment_id = $3`,
          [status.confirmations, status.txHash, payment.payment_id]
        );
        
        // Confirm the prime claim
        await db.query(
          `UPDATE prime_claims 
           SET payment_status = 'paid',
               verified = true,
               paid_at = NOW(),
               amount_paid = $1,
               payment_method = 'dogecoin',
               dogecoin_payment_id = $2
           WHERE prime_number = $3`,
          [payment.amount_usd, payment.payment_id, payment.prime_number]
        );
        
        logger.info('Dogecoin payment confirmed', {
          paymentId: payment.payment_id,
          prime: payment.prime_number,
          email: payment.email,
          txHash: status.txHash,
          amountDOGE: payment.amount_doge
        });
        
        // Send confirmation email with meme
        const { sendPaymentConfirmation } = require('./email');
        await sendPaymentConfirmation(
          payment.email, 
          payment.prime_number, 
          payment.amount_usd,
          'dogecoin',
          status.txHash,
          { 
            amountDOGE: payment.amount_doge,
            memeText: getMemeText() 
          }
        );
      }
    }
  } catch (err) {
    logger.error('Error monitoring Dogecoin payments:', err);
  }
}

// Get Dogecoin stats
async function getDogeStats() {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_doge_payments,
        SUM(amount_usd) as total_doge_revenue,
        SUM(amount_doge) as total_doge_collected,
        AVG(amount_doge) as avg_doge_payment,
        COUNT(*) FILTER (WHERE is_meme_amount = true) as meme_amount_payments
      FROM dogecoin_payments
      WHERE status = 'confirmed'
    `);
    
    return stats.rows[0];
  } catch (err) {
    logger.error('Error getting Doge stats:', err);
    return null;
  }
}

module.exports = {
  generateDogeAddress,
  generateDogeQRCode,
  getDOGEPrice,
  convertUSDToDOGE,
  createDogePayment,
  checkDogePaymentStatus,
  monitorDogePayments,
  getDogeStats,
  getMemeText
};