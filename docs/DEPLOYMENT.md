# THE QP - Deployment Guide

This guide consolidates all deployment information for THE QP application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development](#local-development)
3. [Production Checklist](#production-checklist)
4. [Deployment Options](#deployment-options)
5. [Post-Deployment](#post-deployment)

## Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Stripe account (production keys)
- Bitcoin wallet (xpub key for mainnet)
- Domain name (theqp.ai)

## Local Development

1. Clone and install:
```bash
git clone https://github.com/yourusername/theqp.git
cd theqp
npm install
```

2. Set up environment:
```bash
cp .env.example .env
# Edit .env with your local values
```

3. Initialize database:
```bash
psql -U postgres -c "CREATE DATABASE theqp;"
psql -U postgres -d theqp -f scripts/schema.sql
```

4. Run locally:
```bash
npm run dev
```

## Production Checklist

### Security Keys
```bash
# Generate production secrets
JWT_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 24)
```

### Bitcoin Setup
- Generate HD wallet for Bitcoin payments
- Obtain mainnet xpub key
- Test address generation
- Verify blockchain monitoring

### Stripe Configuration
- Switch to production keys
- Configure webhook: `https://theqp.ai/webhook/stripe`
- Enable events: `payment_intent.succeeded`
- Test with live card

### Database
- Create production PostgreSQL instance
- Run schema.sql
- Reserve prime #2 for robbie@theqp.ai
- Enable automated backups

## Deployment Options

### Option 1: Railway (Recommended - Free Tier)
```bash
# Login and create project
railway login
railway init

# Deploy
railway up

# Add PostgreSQL
railway add

# Set environment variables
railway variables set $(cat .env.production | grep -v '^#' | xargs)
```

### Option 2: Fly.io
```bash
# Deploy with configuration
fly deploy

# Set secrets
fly secrets set $(cat .env.production | grep -v '^#' | xargs)
```

### Option 3: AWS EC2 + RDS
```bash
# Use Terraform
cd terraform
terraform init
terraform plan
terraform apply

# Deploy application
ssh ec2-user@your-instance
git clone https://github.com/yourusername/theqp.git
cd theqp
npm ci --production
pm2 start src/server.js --name theqp
```

### Option 4: Docker
```bash
# Build and run
docker-compose -f docker-compose.prod.yml up -d

# Or with individual commands
docker build -t theqp .
docker run -d --env-file .env.production -p 3000:3000 theqp
```

## Post-Deployment

### Domain Configuration
1. Point domain to your deployment
2. Configure SSL certificate
3. Force HTTPS redirect

### Initial Data
```sql
-- Reserve prime 2 for founder
INSERT INTO prime_claims (prime_number, email, payment_status, payment_method, amount_paid, claimed_at)
VALUES (2, 'robbie@theqp.ai', 'paid', 'founder', 2, NOW());
```

### Monitoring
- Set up error alerts
- Configure uptime monitoring
- Monitor payment success rates
- Watch server resources

### Testing Production
1. Test homepage loads with SSL
2. Verify stats display
3. Test email validation
4. Make small test payment (prime #3)
5. Verify email confirmation
6. Check Bitcoin payment flow

## Emergency Procedures

### Rollback Plan
1. Point DNS to holding page
2. Fix issues in staging
3. Re-deploy when resolved

### Support Contacts
- Stripe: support@stripe.com
- AWS: Your support plan
- Domain: GoDaddy support

## Security Notes

⚠️ **CRITICAL**: 
- Never commit .env files
- Store wallet mnemonic offline
- Rotate secrets regularly
- Monitor for suspicious activity

---

Ready to serve the quantum pie! 🥧