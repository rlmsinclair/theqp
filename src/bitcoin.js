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

// Bitcoin network (mainnet or testnet)
const network = config.bitcoin.network === 'mainnet' 
  ? bitcoin.networks.bitcoin 
  : bitcoin.networks.testnet;

// HD wallet for address generation (lazy initialization)
let hdNode = null;

function getHdNode() {
  if (!hdNode && config.bitcoin.xpub) {
    try {
      hdNode = bip32Factory.fromBase58(config.bitcoin.xpub, network);
    } catch (err) {
      logger.error('Invalid Bitcoin xpub key:', err.message);
      throw new Error('Bitcoin configuration error: Invalid xpub key');
    }
  }
  return hdNode;
}

// Generate unique Bitcoin address for a prime
function generatePaymentAddress(prime) {
  try {
    // Use prime number as derivation index
    const node = getHdNode();
    if (!node) {
      throw new Error('Bitcoin HD node not initialized');
    }
    const child = node.derive(0).derive(prime);
    const { address } = bitcoin.payments.p2wpkh({ 
      pubkey: child.publicKey, 
      network 
    });
    
    logger.info('Generated Bitcoin address', { prime, address });
    return address;
  } catch (err) {
    logger.error('Error generating Bitcoin address:', err);
    throw err;
  }
}

// Generate QR code for payment
async function generateQRCode(address, amountBTC) {
  try {
    const bitcoinURI = `bitcoin:${address}?amount=${amountBTC}&label=TheQP`;
    const qrDataURL = await QRCode.toDataURL(bitcoinURI, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrDataURL;
  } catch (err) {
    logger.error('Error generating QR code:', err);
    throw err;
  }
}

// Get current BTC/USD price
async function getBTCPrice() {
  try {
    // Try multiple price sources for reliability
    const sources = [
      {
        name: 'Coinbase',
        url: 'https://api.coinbase.com/v2/exchange-rates?currency=BTC',
        parser: (data) => parseFloat(data.data.rates.USD)
      },
      {
        name: 'CoinGecko',
        url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
        parser: (data) => data.bitcoin.usd
      }
    ];
    
    for (const source of sources) {
      try {
        const response = await axios.get(source.url, { timeout: 5000 });
        const price = source.parser(response.data);
        
        if (price && price > 0) {
          logger.info(`BTC price from ${source.name}: $${price}`);
          return price;
        }
      } catch (err) {
        logger.warn(`Failed to get price from ${source.name}:`, err.message);
      }
    }
    
    throw new Error('Unable to fetch BTC price from any source');
  } catch (err) {
    logger.error('Error getting BTC price:', err);
    throw err;
  }
}

// Convert USD to BTC
async function convertUSDToBTC(usdAmount) {
  const btcPrice = await getBTCPrice();
  const btcAmount = (usdAmount / btcPrice).toFixed(8);
  return {
    btcAmount,
    btcPrice,
    usdAmount
  };
}

// Create Bitcoin payment
async function createBitcoinPayment(prime, email) {
  try {
    const paymentId = uuidv4();
    const address = generatePaymentAddress(prime);
    const { btcAmount, btcPrice } = await convertUSDToBTC(prime);
    const qrCode = await generateQRCode(address, btcAmount);
    
    // Store payment request
    await db.query(
      `INSERT INTO bitcoin_payments 
       (payment_id, prime_number, email, address, amount_btc, amount_usd, btc_price, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
      [paymentId, prime, email, address, btcAmount, prime, btcPrice]
    );
    
    logger.info('Bitcoin payment created', {
      paymentId,
      prime,
      email,
      address,
      amountBTC: btcAmount,
      amountUSD: prime
    });
    
    return {
      paymentId,
      address,
      amountBTC: btcAmount,
      amountUSD: prime,
      btcPrice,
      qrCode,
      expiresAt: new Date(Date.now() + 3600000) // 1 hour
    };
  } catch (err) {
    logger.error('Error creating Bitcoin payment:', err);
    throw err;
  }
}

// Check payment status via blockchain API
async function checkPaymentStatus(address, expectedAmount) {
  try {
    // Using blockchain.info API (no auth required)
    const response = await axios.get(
      `https://blockchain.info/address/${address}?format=json`,
      { timeout: 10000 }
    );
    
    const data = response.data;
    const totalReceived = data.total_received / 100000000; // Convert from satoshis
    
    if (totalReceived >= parseFloat(expectedAmount)) {
      return {
        paid: true,
        confirmations: data.txs[0]?.confirmations || 0,
        txHash: data.txs[0]?.hash || null,
        amountReceived: totalReceived
      };
    }
    
    return {
      paid: false,
      amountReceived: totalReceived
    };
  } catch (err) {
    logger.error('Error checking payment status:', err);
    return { paid: false, error: err.message };
  }
}

// Monitor Bitcoin payments
async function monitorBitcoinPayments() {
  try {
    // Get all pending Bitcoin payments
    const pendingPayments = await db.query(
      `SELECT * FROM bitcoin_payments 
       WHERE status = 'pending' 
       AND created_at > NOW() - INTERVAL '2 hours'`
    );
    
    for (const payment of pendingPayments.rows) {
      const status = await checkPaymentStatus(payment.address, payment.amount_btc);
      
      if (status.paid) {
        // Update payment status
        await db.query(
          `UPDATE bitcoin_payments 
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
               payment_method = 'bitcoin',
               bitcoin_payment_id = $2
           WHERE prime_number = $3`,
          [payment.amount_usd, payment.payment_id, payment.prime_number]
        );
        
        logger.info('Bitcoin payment confirmed', {
          paymentId: payment.payment_id,
          prime: payment.prime_number,
          email: payment.email,
          txHash: status.txHash
        });
        
        // Send confirmation email
        const { sendPaymentConfirmation } = require('./email');
        await sendPaymentConfirmation(
          payment.email, 
          payment.prime_number, 
          payment.amount_usd,
          'bitcoin',
          status.txHash
        );
      }
    }
  } catch (err) {
    logger.error('Error monitoring Bitcoin payments:', err);
  }
}

// WebSocket for real-time payment updates
function setupBitcoinWebSocket(wss) {
  // Monitor blockchain for payment confirmations
  setInterval(() => monitorBitcoinPayments(), 30000); // Check every 30 seconds
  
  // Send updates to connected clients
  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      try {
        const { type, paymentId } = JSON.parse(message);
        
        if (type === 'check_payment') {
          const result = await db.query(
            'SELECT * FROM bitcoin_payments WHERE payment_id = $1',
            [paymentId]
          );
          
          if (result.rows.length > 0) {
            const payment = result.rows[0];
            ws.send(JSON.stringify({
              type: 'payment_status',
              status: payment.status,
              confirmations: payment.confirmations
            }));
          }
        }
      } catch (err) {
        logger.error('WebSocket error:', err);
      }
    });
  });
}

// Clean up expired Bitcoin payments
async function cleanupExpiredPayments() {
  try {
    const result = await db.query(
      `DELETE FROM bitcoin_payments 
       WHERE status = 'pending' 
       AND created_at < NOW() - INTERVAL '2 hours'
       RETURNING payment_id`
    );
    
    if (result.rows.length > 0) {
      logger.info('Cleaned up expired Bitcoin payments', { count: result.rows.length });
    }
  } catch (err) {
    logger.error('Error cleaning up expired payments:', err);
  }
}

module.exports = {
  generatePaymentAddress,
  generateQRCode,
  getBTCPrice,
  convertUSDToBTC,
  createBitcoinPayment,
  checkPaymentStatus,
  monitorBitcoinPayments,
  setupBitcoinWebSocket,
  cleanupExpiredPayments
};