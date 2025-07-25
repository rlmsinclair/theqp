const express = require('express');
const router = express.Router();
const { constructWebhookEvent } = require('../payments');
const { confirmPayment } = require('../prime');
const { sendPaymentConfirmation, sendPaymentFailedEmail } = require('../email');
const logger = require('../utils/logger');

// Stripe webhook handler - requires raw body
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  if (!sig) {
    logger.error('Missing stripe signature header');
    return res.status(400).send('Missing stripe signature');
  }
  
  let event;
  
  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        
        // Confirm payment in database
        const confirmation = await confirmPayment(
          paymentIntent.id,
          paymentIntent.amount / 100 // Convert from cents to dollars
        );
        
        if (confirmation.success) {
          // Send confirmation email
          await sendPaymentConfirmation(
            confirmation.email,
            confirmation.prime,
            paymentIntent.amount / 100
          );
          
          logger.info('Payment processed successfully', {
            prime: confirmation.prime,
            email: confirmation.email,
            amount: paymentIntent.amount / 100
          });
        }
        break;
        
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        const email = failedPayment.metadata.email;
        const prime = failedPayment.metadata.prime;
        
        if (email && prime) {
          await sendPaymentFailedEmail(email, prime);
        }
        
        logger.info('Payment failed', {
          email,
          prime,
          reason: failedPayment.last_payment_error?.message
        });
        break;
        
      case 'charge.dispute.created':
        const dispute = event.data.object;
        logger.warn('Payment dispute created', {
          chargeId: dispute.charge,
          amount: dispute.amount / 100,
          reason: dispute.reason
        });
        // Handle disputes - possibly suspend the prime
        break;
        
      default:
        logger.info('Unhandled webhook event type', { type: event.type });
    }
    
    res.json({ received: true });
  } catch (err) {
    logger.error('Webhook processing error:', err);
    res.status(500).send('Webhook processing failed');
  }
});

module.exports = router;