# THE QP Infrastructure - Secrets Management

# SSM Parameters for sensitive data
resource "aws_ssm_parameter" "stripe_secret_key" {
  name  = "/${var.project_name}/${var.environment}/stripe/secret_key"
  type  = "SecureString"
  value = "sk_live_PLACEHOLDER" # Update via AWS Console or CLI
  
  lifecycle {
    ignore_changes = [value]
  }
  
  tags = {
    Name = "${var.project_name}-stripe-secret-key"
  }
}

resource "aws_ssm_parameter" "stripe_publishable_key" {
  name  = "/${var.project_name}/${var.environment}/stripe/publishable_key"
  type  = "String"
  value = "pk_live_PLACEHOLDER" # Update via AWS Console or CLI
  
  lifecycle {
    ignore_changes = [value]
  }
  
  tags = {
    Name = "${var.project_name}-stripe-publishable-key"
  }
}

resource "aws_ssm_parameter" "stripe_webhook_secret" {
  name  = "/${var.project_name}/${var.environment}/stripe/webhook_secret"
  type  = "SecureString"
  value = "whsec_PLACEHOLDER" # Update via AWS Console or CLI
  
  lifecycle {
    ignore_changes = [value]
  }
  
  tags = {
    Name = "${var.project_name}-stripe-webhook-secret"
  }
}

resource "aws_ssm_parameter" "bitcoin_xpub" {
  name  = "/${var.project_name}/${var.environment}/bitcoin/xpub"
  type  = "SecureString"
  value = "xpub_PLACEHOLDER" # Update via AWS Console or CLI
  
  lifecycle {
    ignore_changes = [value]
  }
  
  tags = {
    Name = "${var.project_name}-bitcoin-xpub"
  }
}

resource "aws_ssm_parameter" "dogecoin_xpub" {
  name  = "/${var.project_name}/${var.environment}/dogecoin/xpub"
  type  = "SecureString"
  value = "dgub_PLACEHOLDER" # Update via AWS Console or CLI
  
  lifecycle {
    ignore_changes = [value]
  }
  
  tags = {
    Name = "${var.project_name}-dogecoin-xpub"
  }
}

# Database credentials in SSM
resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.project_name}/${var.environment}/database/password"
  type  = "SecureString"
  value = random_password.db_password.result
  
  tags = {
    Name = "${var.project_name}-db-password"
  }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/${var.project_name}/${var.environment}/jwt/secret"
  type  = "SecureString"
  value = random_password.jwt_secret.result
  
  tags = {
    Name = "${var.project_name}-jwt-secret"
  }
}

resource "aws_ssm_parameter" "session_secret" {
  name  = "/${var.project_name}/${var.environment}/session/secret"
  type  = "SecureString"
  value = random_password.session_secret.result
  
  tags = {
    Name = "${var.project_name}-session-secret"
  }
}

# Secrets Manager for API keys rotation (optional)
resource "aws_secretsmanager_secret" "api_keys" {
  name = "${var.project_name}-${var.environment}-api-keys"
  
  rotation_rules {
    automatically_after_days = 90
  }
  
  tags = {
    Name = "${var.project_name}-api-keys"
  }
}

resource "aws_secretsmanager_secret_version" "api_keys" {
  secret_id = aws_secretsmanager_secret.api_keys.id
  
  secret_string = jsonencode({
    stripe_secret_key      = "sk_live_PLACEHOLDER"
    stripe_webhook_secret  = "whsec_PLACEHOLDER"
    bitcoin_xpub          = "xpub_PLACEHOLDER"
    dogecoin_xpub         = "dgub_PLACEHOLDER"
  })
  
  lifecycle {
    ignore_changes = [secret_string]
  }
}