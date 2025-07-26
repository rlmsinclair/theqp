const config = require('./config');
const logger = require('./utils/logger');

// Only initialize Stripe if enabled
let stripe = null;
if (config.features.stripeEnabled) {
  const Stripe = require('stripe');
  stripe = new Stripe(config.stripe.secretKey);
}

// Calculate price based on prime number
function getPrice(prime) {
  // Each slice of the pie costs its prime number in dollars
  // The bigger the prime, the bigger the slice! 🥧
  return prime;
}

// Payment methods
const PaymentMethod = {
  STRIPE: 'stripe',
  BITCOIN: 'bitcoin'
};

// Create payment intent
async function createPaymentIntent(prime, email) {
  if (!config.features.stripeEnabled) {
    throw new Error('Stripe payments are not enabled');
  }
  
  try {
    const amount = getPrice(prime);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Stripe uses cents
      currency: 'usd',
      metadata: {
        prime: prime.toString(),
        email: email
      },
      description: `THE QPAI - Slice #${prime} 🥧`,
      receipt_email: email,
      automatic_payment_methods: {
        enabled: true,
      }
    });
    
    logger.info('Payment intent created', {
      prime,
      email,
      amount,
      paymentIntentId: paymentIntent.id
    });
    
    return paymentIntent;
  } catch (err) {
    logger.error('Error creating payment intent:', err);
    throw err;
  }
}

// Retrieve payment intent
async function getPaymentIntent(paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return paymentIntent;
  } catch (err) {
    logger.error('Error retrieving payment intent:', err);
    throw err;
  }
}

// Cancel payment intent
async function cancelPaymentIntent(paymentIntentId) {
  try {
    const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
    logger.info('Payment intent cancelled', { paymentIntentId });
    return paymentIntent;
  } catch (err) {
    logger.error('Error cancelling payment intent:', err);
    throw err;
  }
}

// Construct webhook event
function constructWebhookEvent(payload, signature) {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
    return event;
  } catch (err) {
    logger.error('Webhook signature verification failed:', err);
    throw err;
  }
}

// Create customer
async function createCustomer(email, paymentMethodId) {
  try {
    const customer = await stripe.customers.create({
      email,
      payment_method: paymentMethodId,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
    
    logger.info('Customer created', { email, customerId: customer.id });
    return customer;
  } catch (err) {
    logger.error('Error creating customer:', err);
    throw err;
  }
}

// Create subscription for recurring primes (future feature)
async function createSubscription(customerId, priceId) {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
    
    logger.info('Subscription created', { customerId, subscriptionId: subscription.id });
    return subscription;
  } catch (err) {
    logger.error('Error creating subscription:', err);
    throw err;
  }
}

// Get payment history for email
async function getPaymentHistory(email) {
  try {
    const paymentIntents = await stripe.paymentIntents.search({
      query: `metadata['email']:'${email}'`,
      limit: 100,
    });
    
    return paymentIntents.data.map(pi => ({
      id: pi.id,
      amount: pi.amount / 100,
      status: pi.status,
      created: new Date(pi.created * 1000),
      prime: pi.metadata.prime,
    }));
  } catch (err) {
    logger.error('Error getting payment history:', err);
    throw err;
  }
}

module.exports = {
  getPrice,
  createPaymentIntent,
  getPaymentIntent,
  cancelPaymentIntent,
  constructWebhookEvent,
  createCustomer,
  createSubscription,
  getPaymentHistory
};