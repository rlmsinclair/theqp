# THE QP Infrastructure - Outputs

output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the load balancer"
  value       = aws_lb.main.zone_id
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "redis_endpoint" {
  description = "Redis cache endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
  sensitive   = true
}

output "ses_domain_identity_arn" {
  description = "ARN of the SES domain identity"
  value       = aws_ses_domain_identity.main.arn
}

output "cloudwatch_dashboard_url" {
  description = "URL to CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "sns_topic_arn" {
  description = "ARN of the SNS topic for alerts"
  value       = aws_sns_topic.alerts.arn
}

output "backup_bucket_name" {
  description = "Name of the S3 bucket for backups"
  value       = aws_s3_bucket.backups.id
}

output "route53_zone_id" {
  description = "Route53 hosted zone ID"
  value       = var.manage_dns ? aws_route53_zone.main[0].zone_id : null
}

output "name_servers" {
  description = "Name servers for the Route53 zone"
  value       = var.manage_dns ? aws_route53_zone.main[0].name_servers : null
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = var.ssl_certificate_arn != "" ? var.ssl_certificate_arn : aws_acm_certificate.main[0].arn
}

output "deployment_instructions" {
  description = "Post-deployment instructions"
  value = <<-EOT
    Deployment Complete! Next steps:
    
    1. Update DNS records (if not managed by Terraform):
       - Point ${var.domain_name} to: ${aws_lb.main.dns_name}
       - Point www.${var.domain_name} to: ${aws_lb.main.dns_name}
    
    2. Update SSM parameters with actual values:
       - Stripe keys: /${var.project_name}/${var.environment}/stripe/*
       - Bitcoin xpub: /${var.project_name}/${var.environment}/bitcoin/xpub
       - Dogecoin xpub: /${var.project_name}/${var.environment}/dogecoin/xpub
    
    3. Verify SES domain:
       - Check AWS SES console for verification status
       - Add DKIM records if managing DNS outside AWS
    
    4. Test all payment methods:
       - Stripe: Use test cards in test mode first
       - Bitcoin: Test with small amounts on mainnet
       - Dogecoin: Test with meme amounts (69, 420)
    
    5. Monitor the dashboard:
       ${format("https://%s.console.aws.amazon.com/cloudwatch/home?region=%s#dashboards:name=%s", 
         var.aws_region, var.aws_region, aws_cloudwatch_dashboard.main.dashboard_name)}
    
    6. Subscribe to alerts:
       - Confirm SNS email subscription sent to: ${var.alarm_email}
  EOT
}