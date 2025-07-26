require('dotenv').config();

const config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || 'localhost',
    domain: process.env.DOMAIN || 'http://localhost:3000'
  },
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10)
  },
  security: {
    jwtSecret: process.env.JWT_SECRET,
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    sessionSecret: process.env.SESSION_SECRET
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    ses: {
      fromEmail: process.env.SES_FROM_EMAIL
    }
  },
  stripe: {
    // Stripe disabled - using dummy values
    secretKey: 'sk_test_disabled',
    publishableKey: 'pk_test_disabled',
    webhookSecret: 'whsec_disabled'
  },
  bitcoin: {
    network: process.env.BITCOIN_NETWORK || 'mainnet',
    xpub: process.env.BITCOIN_XPUB
  },
  dogecoin: {
    xpub: process.env.DOGECOIN_XPUB
  },
  email: {
    verificationExpires: process.env.EMAIL_VERIFICATION_EXPIRES || '24h'
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log'
  },
  // Feature flags
  features: {
    stripeEnabled: process.env.ENABLE_STRIPE === 'true',
    bitcoinEnabled: process.env.ENABLE_BITCOIN !== 'false',
    dogecoinEnabled: process.env.ENABLE_DOGECOIN !== 'false'
  }
};

// Validate required config (excluding Stripe)
const requiredConfigs = [
  'database.url',
  'security.jwtSecret',
  'bitcoin.xpub',
  'dogecoin.xpub'
];

function validateConfig() {
  const missing = [];
  
  requiredConfigs.forEach(path => {
    const keys = path.split('.');
    let value = config;
    
    for (const key of keys) {
      value = value[key];
      if (!value) {
        missing.push(path);
        break;
      }
    }
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}

if (config.app.env === 'production') {
  validateConfig();
}

module.exports = config;