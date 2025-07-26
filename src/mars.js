// THE QP - Mars Reservation System
// Tracks when Elon says Mars is ready

const db = require('./database');
const logger = require('./utils/logger');
const axios = require('axios');
const cron = require('node-cron');
const { sendEmail } = require('./email');

// Twitter API v2 configuration (you'll need to set up Twitter API access)
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const ELON_TWITTER_ID = '44196397'; // Elon's Twitter user ID

// Keywords that indicate Mars is ready
const MARS_READY_KEYWORDS = [
  'mars is ready',
  'humans can go to mars',
  'mars tickets on sale',
  'mars colony open',
  'starship to mars ready',
  'moving to mars',
  'mars is now habitable',
  'first mars flight'
];

// Check if a tweet indicates Mars is ready
function isMarsReadyTweet(text) {
  const lowerText = text.toLowerCase();
  return MARS_READY_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// Get recent tweets from Elon
async function getElonTweets() {
  if (!TWITTER_BEARER_TOKEN) {
    logger.warn('Twitter Bearer Token not configured - skipping Mars check');
    return [];
  }
  
  try {
    const response = await axios.get(
      `https://api.twitter.com/2/users/${ELON_TWITTER_ID}/tweets`,
      {
        headers: {
          'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}`
        },
        params: {
          'tweet.fields': 'created_at,text',
          'max_results': 10
        }
      }
    );
    
    return response.data.data || [];
  } catch (error) {
    logger.error('Failed to fetch Elon tweets:', error);
    return [];
  }
}

// Check Mars status
async function checkMarsStatus() {
  logger.info('🚀 Checking Mars status...');
  
  try {
    // Log the check
    await db.query(
      'INSERT INTO mars_status_checks (ip_address, user_agent) VALUES ($1, $2)',
      ['system-check', 'mars-monitor/1.0']
    );
    
    // Get Elon's recent tweets
    const tweets = await getElonTweets();
    
    // Check if any tweet indicates Mars is ready
    const marsReadyTweet = tweets.find(tweet => isMarsReadyTweet(tweet.text));
    
    if (marsReadyTweet) {
      logger.info('🚀🚀🚀 MARS IS READY! 🚀🚀🚀');
      logger.info('Tweet:', marsReadyTweet.text);
      
      // Update database
      const result = await db.query('SELECT * FROM check_mars_ready($1)', [true]);
      
      // Send notification email
      await sendEmail({
        to: 'hello@theqp.ai',
        subject: '🚀 MARS IS READY - Prime 421 Available!',
        html: `
          <h1>🚀 Mars is Ready! 🚀</h1>
          <p>Elon Musk has announced that Mars is ready for humans!</p>
          <p>Tweet: "${marsReadyTweet.text}"</p>
          <p>Prime 421 is now available for Elon to claim at <a href="https://theqp.ai/mars">theqp.ai/mars</a></p>
          <p>This is a historic moment for THE QP!</p>
        `
      });
      
      // TODO: Send notifications to social media
      // TODO: Update website banner
      // TODO: Alert the media
      
      return true;
    }
    
    logger.info('Mars not ready yet. Still waiting... ⏳');
    return false;
    
  } catch (error) {
    logger.error('Error checking Mars status:', error);
    return false;
  }
}

// Get Mars reservation status
async function getMarsReservationStatus() {
  try {
    const result = await db.query('SELECT * FROM mars_reservation_status');
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting Mars reservation status:', error);
    return null;
  }
}

// Check if prime is reserved
async function isPrimeReserved(prime) {
  try {
    const result = await db.query(
      `SELECT * FROM prime_reservations 
       WHERE prime_number = $1 
       AND claimed = FALSE`,
      [prime]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    logger.error('Error checking prime reservation:', error);
    return false;
  }
}

// Get all special reservations
async function getSpecialReservations() {
  try {
    const result = await db.query(
      `SELECT * FROM prime_reservations 
       WHERE claimed = FALSE 
       ORDER BY prime_number`
    );
    
    return result.rows;
  } catch (error) {
    logger.error('Error getting special reservations:', error);
    return [];
  }
}

// Manual Mars ready trigger (for testing or manual override)
async function manualMarsReady(adminKey) {
  if (adminKey !== process.env.ADMIN_KEY) {
    throw new Error('Invalid admin key');
  }
  
  logger.info('Manual Mars ready triggered!');
  
  const result = await db.query('SELECT * FROM check_mars_ready($1)', [true]);
  
  await sendEmail({
    to: 'hello@theqp.ai',
    subject: '🚀 MANUAL: MARS IS READY - Prime 421 Available!',
    html: `
      <h1>🚀 Mars is Ready! (Manual Trigger) 🚀</h1>
      <p>Mars readiness was manually triggered by admin.</p>
      <p>Prime 421 is now available for Elon to claim.</p>
    `
  });
  
  return result.rows[0];
}

// Initialize Mars monitoring
function initializeMarsMonitoring() {
  // Check daily at noon UTC
  cron.schedule('0 12 * * *', async () => {
    logger.info('Running scheduled Mars status check');
    await checkMarsStatus();
  });
  
  // Also check every 6 hours if we have Twitter access
  if (process.env.TWITTER_BEARER_TOKEN) {
    cron.schedule('0 */6 * * *', async () => {
      logger.info('Running frequent Mars status check');
      await checkMarsStatus();
    });
  }
  
  logger.info('🚀 Mars monitoring initialized - waiting for Elon to announce Mars is ready!');
}

// Fun stats about Mars checks
async function getMarsStats() {
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_checks,
        COUNT(DISTINCT ip_address) as unique_visitors,
        MAX(checked_at) as last_check,
        MIN(checked_at) as first_check,
        EXTRACT(DAY FROM NOW() - MIN(checked_at)) as days_waiting
      FROM mars_status_checks
    `);
    
    return stats.rows[0];
  } catch (error) {
    logger.error('Error getting Mars stats:', error);
    return null;
  }
}

module.exports = {
  checkMarsStatus,
  getMarsReservationStatus,
  isPrimeReserved,
  getSpecialReservations,
  manualMarsReady,
  initializeMarsMonitoring,
  getMarsStats
};