# THE QP Infrastructure - DNS and Certificate Management

# Route53 Hosted Zone (if managing DNS in AWS)
resource "aws_route53_zone" "main" {
  count = var.manage_dns ? 1 : 0
  name  = var.domain_name
  
  tags = {
    Name = "${var.project_name}-zone"
  }
}

# ACM Certificate
resource "aws_acm_certificate" "main" {
  count                     = var.ssl_certificate_arn == "" ? 1 : 0
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"
  
  lifecycle {
    create_before_destroy = true
  }
  
  tags = {
    Name = "${var.project_name}-cert"
  }
}

# Certificate Validation Records
resource "aws_route53_record" "cert_validation" {
  count   = var.manage_dns && var.ssl_certificate_arn == "" ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = tolist(aws_acm_certificate.main[0].domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.main[0].domain_validation_options)[0].resource_record_type
  records = [tolist(aws_acm_certificate.main[0].domain_validation_options)[0].resource_record_value]
  ttl     = 300
}

# Certificate Validation
resource "aws_acm_certificate_validation" "main" {
  count                   = var.ssl_certificate_arn == "" ? 1 : 0
  certificate_arn         = aws_acm_certificate.main[0].arn
  validation_record_fqdns = var.manage_dns ? [aws_route53_record.cert_validation[0].fqdn] : []
}

# Route53 A Record for ALB
resource "aws_route53_record" "main" {
  count   = var.manage_dns ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = var.domain_name
  type    = "A"
  
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# Route53 www Record
resource "aws_route53_record" "www" {
  count   = var.manage_dns ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = "www.${var.domain_name}"
  type    = "A"
  
  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = true
  }
}

# SES Domain Identity
resource "aws_ses_domain_identity" "main" {
  domain = var.domain_name
}

# SES Domain DKIM
resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

# Route53 Records for SES DKIM
resource "aws_route53_record" "ses_dkim" {
  count   = var.manage_dns ? 3 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# SES Domain Mail From
resource "aws_ses_domain_mail_from" "main" {
  domain           = aws_ses_domain_identity.main.domain
  mail_from_domain = "mail.${aws_ses_domain_identity.main.domain}"
}

# Route53 MX Record for SES
resource "aws_route53_record" "ses_mx" {
  count   = var.manage_dns ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = aws_ses_domain_mail_from.main.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

# Route53 TXT Record for SES SPF
resource "aws_route53_record" "ses_spf" {
  count   = var.manage_dns ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = aws_ses_domain_mail_from.main.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# CloudFront Distribution for Static Assets (optional)
resource "aws_cloudfront_distribution" "static" {
  count = var.enable_cloudfront ? 1 : 0
  
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  
  origin {
    domain_name = aws_lb.main.dns_name
    origin_id   = "ALB-${aws_lb.main.id}"
    
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
  
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "ALB-${aws_lb.main.id}"
    
    forwarded_values {
      query_string = true
      headers      = ["*"]
      
      cookies {
        forward = "all"
      }
    }
    
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  
  viewer_certificate {
    acm_certificate_arn = var.ssl_certificate_arn != "" ? var.ssl_certificate_arn : aws_acm_certificate.main[0].arn
    ssl_support_method  = "sni-only"
  }
  
  tags = {
    Name = "${var.project_name}-cloudfront"
  }
}

# Variables for DNS management
variable "manage_dns" {
  description = "Whether to manage DNS records in Route53"
  type        = bool
  default     = false
}

variable "enable_cloudfront" {
  description = "Whether to enable CloudFront distribution"
  type        = bool
  default     = false
}