# THE QP - Setup & Configuration Guide

## Environment Variables

Create a `.env` file with the following variables:

### Core Configuration
```bash
NODE_ENV=production
PORT=3000
API_URL=https://theqp.ai
```

### Database
```bash
DATABASE_URL=postgresql://username:password@host:5432/theqp
DB_SSL=true
```

### Security
```bash
JWT_SECRET=your-jwt-secret-here
SESSION_SECRET=your-session-secret-here
```

### Stripe
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Bitcoin
```bash
BITCOIN_XPUB=xpub...
BITCOIN_NETWORK=mainnet
```

### Email (AWS SES)
```bash
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
EMAIL_FROM=hello@theqp.ai
```

## Database Schema

The application uses PostgreSQL with the following main tables:

- `prime_claims` - Records of claimed prime numbers
- `payment_intents` - Stripe payment tracking
- `bitcoin_payments` - Bitcoin payment tracking
- `email_verifications` - Email verification tokens

Run `scripts/schema.sql` to create all tables.

## SSL/TLS Configuration

### Using Let's Encrypt
```bash
certbot --nginx -d theqp.ai -d www.theqp.ai
```

### Nginx Configuration
See `nginx/nginx.conf` for production configuration.

## Domain Setup (GoDaddy)

1. Add A records:
   - `@` → Your server IP
   - `www` → Your server IP

2. Configure email:
   - MX records for email service
   - SPF/DKIM for AWS SES

## Monitoring

### Health Check Endpoint
- URL: `/health`
- Expected: 200 OK with JSON status

### CloudWatch Metrics
- Payment success rate
- Response times
- Error rates
- Bitcoin confirmations

## Backup Strategy

### Database
```bash
# Daily backups
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz
```

### Application
- Git repository
- Environment variables in secure storage
- SSL certificates backed up

## Performance Optimization

### Caching
- CloudFront for static assets
- Redis for session storage (optional)
- Database query optimization

### Scaling
- Horizontal scaling with load balancer
- Database read replicas
- Auto-scaling groups

## Security Best Practices

1. **Never expose**:
   - Private keys
   - Database credentials
   - JWT secrets
   - Wallet mnemonics

2. **Always use**:
   - HTTPS everywhere
   - Rate limiting
   - Input validation
   - SQL parameterization

3. **Regular updates**:
   - Node.js dependencies
   - System packages
   - SSL certificates
   - Security patches