# THE QP - Quantum-Proof Prime Identity

> Pay your prime. Become your prime. When 4000 qubits crash Bitcoin, your prime remains.

## Overview

THE QP is a quantum-proof identity system where users purchase their unique prime number. Each email address can claim exactly one prime number by paying the prime number's value in USD.

- Prime #2: $2
- Prime #3: $3
- Prime #17: $17
- Prime #1009: $1,009
- And so on...

## Features

- **One Email, One Prime**: Each email address can own exactly one prime number
- **Pay Your Prime**: The price equals the prime number itself
- **Quantum-Proof**: Prime numbers remain unique regardless of computing advances
- **Instant Ownership**: Stripe payment processing with immediate confirmation
- **Beautiful UI**: Minimalist design with smooth animations
- **Production Ready**: Built with security, scalability, and reliability in mind

## Tech Stack

- **Backend**: Node.js, Express, PostgreSQL
- **Payments**: Stripe
- **Frontend**: Vanilla JavaScript, CSS3
- **Infrastructure**: AWS (EC2, RDS, SES, CloudFront)
- **Monitoring**: CloudWatch, custom metrics
- **Security**: Helmet, rate limiting, input validation

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Stripe account
- AWS account (for production)

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/yourusername/theqp.git
cd theqp
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. Set up database:
```bash
createdb qpdb
psql -d qpdb -f scripts/schema.sql
```

5. Start the server:
```bash
npm run dev
```

6. Visit http://localhost:3000

## Configuration

### Environment Variables

```env
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/qpdb

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (AWS SES)
AWS_REGION=us-east-1
SES_FROM_EMAIL=hello@theqp.ai
```

### Stripe Setup

1. Create a Stripe account at stripe.com
2. Get your API keys from the Dashboard
3. Set up webhook endpoint: `https://yourdomain.com/webhook/stripe`
4. Listen for: `payment_intent.succeeded`

## API Endpoints

### Check Price
```http
POST /api/check-price
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Create Payment
```http
POST /api/create-payment
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Get Statistics
```http
GET /api/stats
```

### Health Check
```http
GET /api/health
```

## Production Deployment

See [DEPLOY_PRODUCTION.md](DEPLOY_PRODUCTION.md) for detailed deployment instructions.

Quick deployment:
```bash
./scripts/deploy-production.sh
```

## Project Structure

```
theqp/
├── src/
│   ├── app.js           # Express application
│   ├── server.js        # Server entry point
│   ├── config.js        # Configuration
│   ├── database.js      # Database connection
│   ├── prime.js         # Prime number logic
│   ├── payments.js      # Stripe integration
│   ├── email.js         # Email service
│   ├── routes/
│   │   ├── api.js       # API routes
│   │   └── webhook.js   # Webhook handlers
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── rateLimiter.js
│   └── utils/
│       └── logger.js
├── public/
│   └── index.html       # Frontend application
├── scripts/
│   ├── schema.sql       # Database schema
│   └── deploy-production.sh
└── package.json
```

## Security

- All payments processed through Stripe
- Rate limiting on all endpoints
- Input validation and sanitization
- SQL injection protection
- XSS protection with CSP headers
- HTTPS only in production
- Webhook signature verification

## Testing

```bash
# Run tests
npm test

# Test payments with Stripe test cards
4242 4242 4242 4242  # Success
4000 0000 0000 0002  # Decline
```

## Monitoring

- CloudWatch dashboards for metrics
- Custom alerts for errors and anomalies
- Real-time payment tracking
- Database performance monitoring

## Contributing

This is a philosophical project about digital permanence. Contributions that enhance the core concept are welcome.

## License

MIT

## Support

- Email: hello@theqp.ai
- Issues: GitHub Issues

---

**THE QP**: Where mathematics meets money, and permanence meets payment.

One email. One prime. Forever.