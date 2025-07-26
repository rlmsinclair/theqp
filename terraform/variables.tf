# THE QP Infrastructure - Variables

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "eu-west-2"
}

variable "environment" {
  description = "Environment name (prod, staging, dev)"
  type        = string
  default     = "prod"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "theqp"
}

variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = "theqp.ai"
}

variable "instance_type" {
  description = "EC2 instance type for application servers"
  type        = string
  default     = "t3.medium"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "qpdb"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "qpuser"
}

variable "min_instances" {
  description = "Minimum number of EC2 instances in ASG"
  type        = number
  default     = 2
}

variable "max_instances" {
  description = "Maximum number of EC2 instances in ASG"
  type        = number
  default     = 10
}

variable "desired_instances" {
  description = "Desired number of EC2 instances in ASG"
  type        = number
  default     = 2
}

variable "stripe_webhook_ips" {
  description = "Stripe webhook IP ranges"
  type        = list(string)
  default     = [
    "3.18.12.63/32",
    "3.130.192.231/32",
    "13.235.14.237/32",
    "13.235.122.149/32",
    "18.211.135.69/32",
    "35.154.171.200/32",
    "52.15.183.38/32",
    "54.88.130.119/32",
    "54.88.130.237/32",
    "54.187.174.169/32",
    "54.187.205.235/32",
    "54.187.216.72/32"
  ]
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for RDS and ALB"
  type        = bool
  default     = true
}

variable "backup_retention_period" {
  description = "RDS backup retention period in days"
  type        = number
  default     = 30
}

variable "enable_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = true
}

variable "ssl_certificate_arn" {
  description = "ACM certificate ARN for HTTPS"
  type        = string
  default     = ""
}

variable "alarm_email" {
  description = "Email for CloudWatch alarms"
  type        = string
  default     = "alerts@theqp.ai"
}