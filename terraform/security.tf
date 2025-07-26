# THE QP Infrastructure - Security Groups

# ALB Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-${var.environment}-alb-"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "${var.project_name}-${var.environment}-alb-sg"
  }
}

# EC2 Security Group
resource "aws_security_group" "ec2" {
  name_prefix = "${var.project_name}-${var.environment}-ec2-"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    description     = "HTTP from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  
  ingress {
    description = "SSH from bastion"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # Restrict to VPC
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-sg"
  }
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-${var.environment}-rds-"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    description     = "PostgreSQL from EC2"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "${var.project_name}-${var.environment}-rds-sg"
  }
}

# Redis Security Group (for session storage)
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-${var.environment}-redis-"
  vpc_id      = aws_vpc.main.id
  
  ingress {
    description     = "Redis from EC2"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "${var.project_name}-${var.environment}-redis-sg"
  }
}

# WAF Web ACL
resource "aws_wafv2_web_acl" "main" {
  name  = "${var.project_name}-${var.environment}-waf"
  scope = "REGIONAL"
  
  default_action {
    allow {}
  }
  
  # Rate limiting rule
  rule {
    name     = "RateLimitRule"
    priority = 1
    
    action {
      block {}
    }
    
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }
  
  # Geo blocking rule (optional)
  rule {
    name     = "GeoBlockingRule"
    priority = 2
    
    action {
      block {}
    }
    
    statement {
      not_statement {
        statement {
          geo_match_statement {
            country_codes = ["US", "CA", "GB", "AU", "DE", "FR", "JP", "SG"]
          }
        }
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-geo-block"
      sampled_requests_enabled   = true
    }
  }
  
  # SQL injection protection
  rule {
    name     = "SQLiProtection"
    priority = 3
    
    action {
      block {}
    }
    
    statement {
      sqli_match_statement {
        field_to_match {
          body {
            oversize_handling = "MATCH"
          }
        }
        
        text_transformation {
          priority = 0
          type     = "URL_DECODE"
        }
        
        text_transformation {
          priority = 1
          type     = "HTML_ENTITY_DECODE"
        }
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-sqli"
      sampled_requests_enabled   = true
    }
  }
  
  # XSS protection
  rule {
    name     = "XSSProtection"
    priority = 4
    
    action {
      block {}
    }
    
    statement {
      xss_match_statement {
        field_to_match {
          body {
            oversize_handling = "MATCH"
          }
        }
        
        text_transformation {
          priority = 0
          type     = "URL_DECODE"
        }
        
        text_transformation {
          priority = 1
          type     = "HTML_ENTITY_DECODE"
        }
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-xss"
      sampled_requests_enabled   = true
    }
  }
  
  # Allow Stripe webhooks
  rule {
    name     = "AllowStripeWebhooks"
    priority = 5
    
    action {
      allow {}
    }
    
    statement {
      and_statement {
        statement {
          byte_match_statement {
            field_to_match {
              uri_path {}
            }
            search_string = "/api/stripe-webhook"
            positional_constraint = "CONTAINS"
            
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        
        statement {
          ip_set_reference_statement {
            arn = aws_wafv2_ip_set.stripe_webhooks.arn
          }
        }
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-stripe-webhooks"
      sampled_requests_enabled   = true
    }
  }
  
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-waf"
    sampled_requests_enabled   = true
  }
  
  tags = {
    Name = "${var.project_name}-${var.environment}-waf"
  }
}

# IP Set for Stripe webhooks
resource "aws_wafv2_ip_set" "stripe_webhooks" {
  name               = "${var.project_name}-stripe-webhook-ips"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.stripe_webhook_ips
  
  tags = {
    Name = "${var.project_name}-stripe-webhook-ips"
  }
}

# Associate WAF with ALB
resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}