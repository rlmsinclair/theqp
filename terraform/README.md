# THE QP - Terraform Infrastructure

This directory contains the complete Terraform configuration for deploying THE QP infrastructure on AWS in the **eu-west-2 (London)** region.

## Overview

The infrastructure supports all three payment methods:
- **Stripe** - Credit card payments
- **Bitcoin** - Cryptocurrency payments with HD wallet address generation
- **Dogecoin** - Meme cryptocurrency payments with special features

## Architecture

- **Compute**: Auto-scaling EC2 instances behind an Application Load Balancer
- **Database**: RDS PostgreSQL with Multi-AZ for high availability
- **Caching**: ElastiCache Redis for session storage
- **Security**: WAF, Security Groups, and SSL/TLS encryption
- **Monitoring**: CloudWatch dashboards, alarms, and log aggregation
- **Email**: AWS SES for transactional emails

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **Terraform** >= 1.0 installed
3. **AWS CLI** configured with credentials
4. **S3 bucket** for Terraform state (in eu-west-2)
5. **Domain** registered (theqp.ai)

## Initial Setup

### 1. Create Terraform State Bucket

```bash
# Create S3 bucket for Terraform state
aws s3 mb s3://theqp-terraform-state-eu-west-2 --region eu-west-2

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket theqp-terraform-state-eu-west-2 \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name theqp-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region eu-west-2
```

### 2. Configure Variables

```bash
# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vim terraform.tfvars
```

Key variables to update:
- `domain_name` - Your domain (e.g., theqp.ai)
- `alarm_email` - Email for CloudWatch alerts
- `manage_dns` - Set to `true` if using Route53 for DNS

### 3. Generate Payment Keys

#### Stripe
1. Create account at https://stripe.com
2. Get live API keys from dashboard
3. Configure webhook endpoint

#### Bitcoin
```bash
# Generate Bitcoin xpub
node generate-bitcoin-xpub.js
# SAVE THE MNEMONIC SECURELY!
```

#### Dogecoin
```bash
# Generate Dogecoin xpub
node generate-dogecoin-xpub.js
# SAVE THE MNEMONIC SECURELY!
```

## Deployment

### 1. Initialize Terraform

```bash
cd terraform
terraform init
```

### 2. Plan Deployment

```bash
terraform plan -out=tfplan
```

### 3. Apply Infrastructure

```bash
terraform apply tfplan
```

### 4. Update Secrets

After infrastructure is created, update the SSM parameters:

```bash
# Stripe keys
aws ssm put-parameter \
  --name "/theqp/prod/stripe/secret_key" \
  --value "sk_live_YOUR_KEY" \
  --type SecureString \
  --overwrite \
  --region eu-west-2

aws ssm put-parameter \
  --name "/theqp/prod/stripe/publishable_key" \
  --value "pk_live_YOUR_KEY" \
  --overwrite \
  --region eu-west-2

aws ssm put-parameter \
  --name "/theqp/prod/stripe/webhook_secret" \
  --value "whsec_YOUR_SECRET" \
  --type SecureString \
  --overwrite \
  --region eu-west-2

# Bitcoin xpub
aws ssm put-parameter \
  --name "/theqp/prod/bitcoin/xpub" \
  --value "xpub_YOUR_XPUB" \
  --type SecureString \
  --overwrite \
  --region eu-west-2

# Dogecoin xpub
aws ssm put-parameter \
  --name "/theqp/prod/dogecoin/xpub" \
  --value "dgub_YOUR_XPUB" \
  --type SecureString \
  --overwrite \
  --region eu-west-2
```

### 5. Deploy Application Code

The infrastructure expects application code to be available. Update the user_data.sh script with your Git repository:

```bash
# Edit user_data.sh
# Update: git clone https://github.com/YOUR_ORG/theqp.ai.git
```

### 6. Configure DNS

If not using Route53 (manage_dns = false), update your DNS:
- A record: Point `theqp.ai` to ALB DNS name
- A record: Point `www.theqp.ai` to ALB DNS name

## Post-Deployment

### 1. Verify Services

```bash
# Check ALB health
aws elbv2 describe-target-health \
  --target-group-arn $(terraform output -raw target_group_arn) \
  --region eu-west-2

# Check application logs
aws logs tail /aws/ec2/theqp/prod --follow --region eu-west-2
```

### 2. Test Payment Methods

1. **Stripe**: Use test mode first with test cards
2. **Bitcoin**: Generate test address and verify QR code
3. **Dogecoin**: Test with meme amounts (69.00, 420.00)

### 3. Monitor Dashboard

Access CloudWatch dashboard:
```bash
terraform output cloudwatch_dashboard_url
```

## Maintenance

### Update Infrastructure

```bash
# Plan changes
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan
```

### Backup Database

Manual backup:
```bash
aws rds create-db-snapshot \
  --db-instance-identifier theqp-prod-db \
  --db-snapshot-identifier theqp-manual-$(date +%Y%m%d-%H%M%S) \
  --region eu-west-2
```

### Scale Resources

Update `terraform.tfvars`:
- `min_instances`, `max_instances` - Auto-scaling limits
- `db_instance_class` - Database size
- `instance_type` - EC2 instance size

## Troubleshooting

### Common Issues

1. **EC2 instances unhealthy**
   - Check application logs in CloudWatch
   - Verify database connectivity
   - Check security group rules

2. **Payment failures**
   - Verify SSM parameters are set correctly
   - Check blockchain monitoring service logs
   - Verify Stripe webhook configuration

3. **High costs**
   - Review CloudWatch cost explorer
   - Check for unused resources
   - Enable auto-scaling based on load

### Useful Commands

```bash
# View all outputs
terraform output

# Check infrastructure state
terraform state list

# Import existing resources
terraform import aws_instance.example i-1234567890abcdef0

# Destroy infrastructure (CAREFUL!)
terraform destroy
```

## Security Notes

1. **Never commit secrets** to Git
2. **Rotate API keys** regularly
3. **Monitor CloudWatch alarms** for security events
4. **Keep mnemonics** in hardware security modules
5. **Enable MFA** on AWS accounts

## Regional Considerations for eu-west-2

- All resources are deployed in eu-west-2 (London)
- Data residency compliant with UK regulations
- Lower latency for European users
- SES sandbox limits may apply initially

## Cost Optimization

Estimated monthly costs (eu-west-2):
- EC2 (2x t3.medium): ~£60
- RDS (db.t3.medium Multi-AZ): ~£120
- ALB: ~£20
- Data transfer: Variable
- Total: ~£200+ depending on usage

## Support

For issues:
1. Check CloudWatch logs
2. Review Terraform state
3. Verify AWS service health
4. Check payment provider status pages