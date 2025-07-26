// THE QP - Mars Reservation System (Simple Version)
// Only Elon can claim Prime 421 by paying with his verified email

const db = require('./database');
const logger = require('./utils/logger');
const { sendEmail } = require('./email');

// Only accept Elon's actual email addresses
const ELON_EMAILS = [
  'elon@spacex.com',
  'elon@tesla.com',
  'elon@x.com',
  'emusk@tesla.com',
  'emusk@spacex.com'
];

// Check if email is Elon's
function isElonEmail(email) {
  return ELON_EMAILS.includes(email.toLowerCase());
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

// Check if prime 421 can be claimed by this email
async function canClaimMarsReservation(email) {
  try {
    // Always show the same message for everyone
    return {
      canClaim: false,
      reason: "Are you sure you're Elon? We're not sure."
    };
    
  } catch (error) {
    logger.error('Error checking Mars claim eligibility:', error);
    return {
      canClaim: false,
      reason: 'Error checking reservation status'
    };
  }
}

// Claim Mars reservation
async function claimMarsReservation(email) {
  try {
    // Verify it's Elon's email
    const eligibility = await canClaimMarsReservation(email);
    if (!eligibility.canClaim) {
      throw new Error(eligibility.reason);
    }
    
    // Update reservation as claimed
    await db.transaction(async (client) => {
      // Mark reservation as claimed
      await client.query(
        `UPDATE prime_reservations 
         SET claimed = TRUE, 
             claimed_at = NOW() 
         WHERE prime_number = 421`,
        []
      );
      
      // Update prime_claims
      await client.query(
        `UPDATE prime_claims 
         SET email = $1,
             payment_status = 'pending',
             is_reserved = FALSE
         WHERE prime_number = 421`,
        [email]
      );
    });
    
    // Send celebration email to THE QP team
    await sendEmail({
      to: 'hello@theqp.ai',
      subject: '🚀🚀🚀 ELON MUSK CLAIMED PRIME 421! 🚀🚀🚀',
      html: `
        <h1>🚀 HISTORIC MOMENT! 🚀</h1>
        <p>Elon Musk has claimed Prime 421!</p>
        <p>Email: ${email}</p>
        <p>THE QP is now officially interplanetary!</p>
        <br>
        <p>Immediate actions:</p>
        <ul>
          <li>Tweet: "Mars is ready. @elonmusk just claimed Prime 421."</li>
          <li>Update website banner</li>
          <li>Send press release</li>
          <li>Alert all media contacts</li>
        </ul>
      `
    });
    
    logger.info('🚀🚀🚀 ELON MUSK CLAIMED PRIME 421! 🚀🚀🚀');
    
    return {
      success: true,
      message: 'Welcome to THE QP, Elon! Your quantum-proof identity awaits on Mars! 🚀'
    };
    
  } catch (error) {
    logger.error('Error claiming Mars reservation:', error);
    throw error;
  }
}

// Get all special reservations
async function getSpecialReservations() {
  try {
    const result = await db.query(
      `SELECT 
        prime_number,
        reserved_for,
        expires_condition,
        reason,
        special_price,
        display_message,
        CASE 
          WHEN claimed THEN 'CLAIMED BY ' || reserved_for || ' ✅'
          WHEN prime_number = 421 THEN 'WAITING FOR ELON 🚀'
          WHEN expires_condition = 'NEVER' THEN 'FOREVER RESERVED 🔒'
          ELSE 'RESERVED'
        END as status
       FROM prime_reservations 
       ORDER BY prime_number`
    );
    
    return result.rows;
  } catch (error) {
    logger.error('Error getting special reservations:', error);
    return [];
  }
}

// Check if any prime is reserved
async function isPrimeReserved(prime) {
  try {
    const result = await db.query(
      `SELECT * FROM prime_reservations 
       WHERE prime_number = $1 
       AND claimed = FALSE`,
      [prime]
    );
    
    if (result.rows.length === 0) {
      return false;
    }
    
    const reservation = result.rows[0];
    
    // Special handling for prime 421
    if (prime === 421) {
      return {
        reserved: true,
        message: 'Reserved exclusively for Elon Musk 🚀',
        specialPage: '/mars'
      };
    }
    
    // Other reservations
    return {
      reserved: true,
      message: reservation.display_message || reservation.reason
    };
    
  } catch (error) {
    logger.error('Error checking prime reservation:', error);
    return false;
  }
}

// Get Mars waiting stats
async function getMarsStats() {
  try {
    const result = await db.query(`
      SELECT 
        DATE_PART('day', NOW() - created_at) as days_waiting,
        created_at as reserved_since,
        claimed,
        claimed_at
      FROM prime_reservations
      WHERE prime_number = 421
    `);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const stats = result.rows[0];
    
    // Get page visit count
    const visits = await db.query(
      'SELECT COUNT(DISTINCT ip_address) as unique_visitors FROM mars_status_checks'
    );
    
    return {
      daysWaiting: Math.floor(stats.days_waiting),
      reservedSince: stats.reserved_since,
      uniqueVisitors: visits.rows[0].unique_visitors,
      claimed: stats.claimed,
      claimedAt: stats.claimed_at,
      status: stats.claimed ? 'CLAIMED BY ELON ✅' : 'WAITING FOR ELON 🚀'
    };
    
  } catch (error) {
    logger.error('Error getting Mars stats:', error);
    return null;
  }
}

// Log Mars page visit
async function logMarsPageVisit(ipAddress, userAgent, referrer) {
  try {
    await db.query(
      `INSERT INTO mars_status_checks (ip_address, user_agent, referrer) 
       VALUES ($1, $2, $3)`,
      [ipAddress, userAgent, referrer]
    );
  } catch (error) {
    logger.error('Error logging Mars page visit:', error);
  }
}

module.exports = {
  getMarsReservationStatus,
  canClaimMarsReservation,
  claimMarsReservation,
  getSpecialReservations,
  isPrimeReserved,
  getMarsStats,
  logMarsPageVisit,
  ELON_EMAILS
};