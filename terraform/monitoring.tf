# THE QP Infrastructure - Monitoring and Alerting

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-alerts"
  
  tags = {
    Name = "${var.project_name}-alerts"
  }
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix],
            [".", "RequestCount", ".", "."],
            [".", "HealthyHostCount", "TargetGroup", aws_lb_target_group.main.arn_suffix, { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Load Balancer Metrics"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", aws_autoscaling_group.main.name],
            [".", "NetworkIn", ".", "."],
            [".", "NetworkOut", ".", "."]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "EC2 Metrics"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.main.id],
            [".", "DatabaseConnections", ".", "."],
            [".", "FreeStorageSpace", ".", ".", { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Database Metrics"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", aws_elasticache_cluster.redis.id],
            [".", "NetworkBytesIn", ".", "."],
            [".", "NetworkBytesOut", ".", "."]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Redis Metrics"
        }
      }
    ]
  })
}

# Application Log Group
resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/ec2/${var.project_name}/${var.environment}"
  retention_in_days = 30
  
  tags = {
    Name = "${var.project_name}-app-logs"
  }
}

# Bitcoin Monitor Log Group
resource "aws_cloudwatch_log_group" "bitcoin_monitor" {
  name              = "/aws/ec2/${var.project_name}/${var.environment}/bitcoin-monitor"
  retention_in_days = 30
  
  tags = {
    Name = "${var.project_name}-bitcoin-monitor-logs"
  }
}

# Dogecoin Monitor Log Group
resource "aws_cloudwatch_log_group" "dogecoin_monitor" {
  name              = "/aws/ec2/${var.project_name}/${var.environment}/dogecoin-monitor"
  retention_in_days = 30
  
  tags = {
    Name = "${var.project_name}-dogecoin-monitor-logs"
  }
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${var.project_name}-${var.environment}-unhealthy-hosts"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "UnHealthyHostCount"
  namespace          = "AWS/ApplicationELB"
  period             = "300"
  statistic          = "Average"
  threshold          = "0"
  alarm_description  = "Unhealthy hosts detected"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    TargetGroup  = aws_lb_target_group.main.arn_suffix
    LoadBalancer = aws_lb.main.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_response_time" {
  alarm_name          = "${var.project_name}-${var.environment}-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "TargetResponseTime"
  namespace          = "AWS/ApplicationELB"
  period             = "300"
  statistic          = "Average"
  threshold          = "1"
  alarm_description  = "High response time detected"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
  }
}

# Custom Metrics for Payment Monitoring
resource "aws_cloudwatch_log_metric_filter" "payment_failures" {
  name           = "${var.project_name}-payment-failures"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "[timestamp, request_id, level=ERROR, message, payment_error=*payment*failed*]"
  
  metric_transformation {
    name      = "PaymentFailures"
    namespace = "${var.project_name}/Application"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "payment_failure_rate" {
  alarm_name          = "${var.project_name}-${var.environment}-payment-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "PaymentFailures"
  namespace          = "${var.project_name}/Application"
  period             = "300"
  statistic          = "Sum"
  threshold          = "10"
  alarm_description  = "High payment failure rate"
  alarm_actions      = [aws_sns_topic.alerts.arn]
  treat_missing_data = "notBreaching"
}

# Bitcoin-specific monitoring
resource "aws_cloudwatch_log_metric_filter" "bitcoin_confirmations" {
  name           = "${var.project_name}-bitcoin-confirmations"
  log_group_name = aws_cloudwatch_log_group.bitcoin_monitor.name
  pattern        = "[timestamp, level, message, confirmations=*confirmed*]"
  
  metric_transformation {
    name      = "BitcoinConfirmations"
    namespace = "${var.project_name}/Bitcoin"
    value     = "1"
  }
}

# Dogecoin-specific monitoring
resource "aws_cloudwatch_log_metric_filter" "dogecoin_meme_payments" {
  name           = "${var.project_name}-dogecoin-meme-payments"
  log_group_name = aws_cloudwatch_log_group.dogecoin_monitor.name
  pattern        = "[timestamp, level, message, meme=*meme*number*]"
  
  metric_transformation {
    name      = "DogecoinMemePayments"
    namespace = "${var.project_name}/Dogecoin"
    value     = "1"
  }
}

# Lambda for automated snapshots
resource "aws_lambda_function" "db_snapshot" {
  filename         = "${path.module}/lambda/db_snapshot.zip"
  function_name    = "${var.project_name}-${var.environment}-db-snapshot"
  role            = aws_iam_role.lambda.arn
  handler         = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambda/db_snapshot.zip")
  runtime         = "python3.11"
  timeout         = 60
  
  environment {
    variables = {
      DB_INSTANCE_ID = aws_db_instance.main.id
      SNS_TOPIC_ARN  = aws_sns_topic.alerts.arn
    }
  }
  
  tags = {
    Name = "${var.project_name}-db-snapshot"
  }
}

# CloudWatch Event for daily snapshots
resource "aws_cloudwatch_event_rule" "db_snapshot" {
  name                = "${var.project_name}-${var.environment}-db-snapshot"
  description         = "Trigger daily RDS snapshot"
  schedule_expression = "cron(0 5 * * ? *)" # 5 AM UTC daily
}

resource "aws_cloudwatch_event_target" "db_snapshot" {
  rule      = aws_cloudwatch_event_rule.db_snapshot.name
  target_id = "LambdaTarget"
  arn       = aws_lambda_function.db_snapshot.arn
}

resource "aws_lambda_permission" "db_snapshot" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.db_snapshot.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.db_snapshot.arn
}