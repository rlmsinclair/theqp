#!/bin/bash
# THE QP - EC2 User Data Script

# Exit on error
set -e

# Update system
yum update -y

# Install dependencies
yum install -y \
  git \
  amazon-cloudwatch-agent \
  postgresql15 \
  jq

# Install Node.js 18
curl -sL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# Create application user
useradd -m -s /bin/bash qpuser

# Create directories
mkdir -p /home/qpuser/theqp.ai
mkdir -p /var/log/theqp
chown -R qpuser:qpuser /home/qpuser/theqp.ai
chown -R qpuser:qpuser /var/log/theqp

# Clone application code
cd /home/qpuser
git clone https://github.com/YOUR_ORG/theqp.ai.git theqp.ai
cd theqp.ai

# Create production environment file
cat > .env << EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://${db_username}:${db_password}@${db_endpoint}/${db_name}?ssl=true
DB_SSL=true
DB_POOL_SIZE=20

# Redis
REDIS_URL=redis://${redis_endpoint}:6379

# Security
JWT_SECRET=${jwt_secret}
SESSION_SECRET=${session_secret}
BCRYPT_ROUNDS=12

# AWS
AWS_REGION=${aws_region}

# Email
SES_FROM_EMAIL=${ses_from_email}
EMAIL_VERIFICATION_EXPIRES=24h

# Domain
DOMAIN=${domain}
FRONTEND_URL=${domain}

# Stripe
STRIPE_SECRET_KEY=${stripe_secret_key}
STRIPE_PUBLISHABLE_KEY=${stripe_publishable_key}
STRIPE_WEBHOOK_SECRET=${stripe_webhook_secret}

# Bitcoin
BITCOIN_NETWORK=mainnet
BITCOIN_XPUB=${bitcoin_xpub}

# Dogecoin
DOGECOIN_XPUB=${dogecoin_xpub}

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=50

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/theqp/app.log
EOF

# Set permissions
chown qpuser:qpuser .env
chmod 600 .env

# Install dependencies
sudo -u qpuser npm install --production

# Run database migrations
sudo -u qpuser npm run db:migrate || echo "Migration script not found, skipping..."

# Create systemd service for main application
cat > /etc/systemd/system/theqp.service << 'EOF'
[Unit]
Description=THE QP Application
After=network.target

[Service]
Type=simple
User=qpuser
WorkingDirectory=/home/qpuser/theqp.ai
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/theqp/app.log
StandardError=append:/var/log/theqp/app-error.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Create systemd service for Bitcoin monitor
cat > /etc/systemd/system/bitcoin-monitor.service << 'EOF'
[Unit]
Description=Bitcoin Payment Monitor for THE QP
After=network.target

[Service]
Type=simple
User=qpuser
WorkingDirectory=/home/qpuser/theqp.ai
ExecStart=/usr/bin/node scripts/bitcoin-monitor.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/theqp/bitcoin-monitor.log
StandardError=append:/var/log/theqp/bitcoin-monitor-error.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Create systemd service for Dogecoin monitor
cat > /etc/systemd/system/dogecoin-monitor.service << 'EOF'
[Unit]
Description=Dogecoin Payment Monitor for THE QP
After=network.target

[Service]
Type=simple
User=qpuser
WorkingDirectory=/home/qpuser/theqp.ai
ExecStart=/usr/bin/node scripts/dogecoin-monitor.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/theqp/dogecoin-monitor.log
StandardError=append:/var/log/theqp/dogecoin-monitor-error.log
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
systemctl daemon-reload
systemctl enable theqp.service bitcoin-monitor.service dogecoin-monitor.service
systemctl start theqp.service bitcoin-monitor.service dogecoin-monitor.service

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "agent": {
    "metrics_collection_interval": 60,
    "run_as_user": "cwagent"
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/theqp/app.log",
            "log_group_name": "/aws/ec2/${project_name}/${environment}",
            "log_stream_name": "{instance_id}/app",
            "retention_in_days": 30
          },
          {
            "file_path": "/var/log/theqp/app-error.log",
            "log_group_name": "/aws/ec2/${project_name}/${environment}",
            "log_stream_name": "{instance_id}/app-error",
            "retention_in_days": 30
          },
          {
            "file_path": "/var/log/theqp/bitcoin-monitor.log",
            "log_group_name": "/aws/ec2/${project_name}/${environment}/bitcoin-monitor",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 30
          },
          {
            "file_path": "/var/log/theqp/dogecoin-monitor.log",
            "log_group_name": "/aws/ec2/${project_name}/${environment}/dogecoin-monitor",
            "log_stream_name": "{instance_id}",
            "retention_in_days": 30
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "${project_name}/EC2",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_USAGE_IDLE",
            "unit": "Percent"
          },
          {
            "name": "cpu_usage_iowait",
            "rename": "CPU_USAGE_IOWAIT",
            "unit": "Percent"
          },
          "cpu_time_guest"
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "*"
        ]
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "DISK_USED_PERCENT",
            "unit": "Percent"
          },
          "disk_free"
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "*"
        ]
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "MEM_USED_PERCENT",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60
      }
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# Setup log rotation
cat > /etc/logrotate.d/theqp << 'EOF'
/var/log/theqp/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 qpuser qpuser
    sharedscripts
    postrotate
        systemctl reload theqp.service bitcoin-monitor.service dogecoin-monitor.service > /dev/null 2>&1 || true
    endscript
}
EOF

# Create health check script
cat > /usr/local/bin/health-check.sh << 'EOF'
#!/bin/bash
curl -f http://localhost:3000/api/health || exit 1
EOF
chmod +x /usr/local/bin/health-check.sh

# Signal completion
echo "THE QP deployment complete" > /tmp/deployment-complete.txt