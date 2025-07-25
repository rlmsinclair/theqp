const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const config = require('./config');
const logger = require('./utils/logger');

// Initialize SES client
const sesClient = new SESClient({ 
  region: config.aws.region 
});

// Email templates
const templates = {
  paymentConfirmation: (prime, amount) => ({
    subject: `Welcome to THE QP - You are Prime #${prime}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; background: #000; color: #fff; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .header { text-align: center; margin-bottom: 40px; }
          .header h1 { font-size: 48px; font-weight: 300; margin: 0; letter-spacing: -2px; }
          .content { background: rgba(255,255,255,0.05); padding: 40px; border-radius: 10px; text-align: center; }
          .prime-number { font-size: 72px; font-weight: 200; margin: 20px 0; color: #fff; }
          .payment-details { margin: 30px 0; padding: 20px; background: rgba(0,255,0,0.1); border-radius: 8px; }
          .amount { font-size: 24px; color: #4caf50; }
          .footer { text-align: center; margin-top: 40px; color: #888; font-size: 14px; }
          .tagline { font-style: italic; margin-top: 20px; opacity: 0.8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>THE QP</h1>
          </div>
          <div class="content">
            <h2>Transaction Complete</h2>
            <div class="prime-number">#${prime}</div>
            <p>This prime number is now permanently yours.</p>
            <div class="payment-details">
              <div class="amount">$${amount} paid</div>
              <p style="margin-top: 10px; opacity: 0.7;">You paid your prime.</p>
            </div>
            <p class="tagline">
              When 4000 qubits crash Bitcoin, your prime remains.<br>
              One email. One prime. Forever.
            </p>
          </div>
          <div class="footer">
            <p>This is your proof of ownership for Prime #${prime}</p>
            <p>Transaction ID: ${new Date().getTime()}-${prime}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
THE QP - Transaction Complete

You are Prime #${prime}

Amount paid: $${amount}

This prime number is now permanently yours.

When 4000 qubits crash Bitcoin, your prime remains.
One email. One prime. Forever.

Transaction ID: ${new Date().getTime()}-${prime}
    `
  }),
  
  paymentFailed: (prime, email) => ({
    subject: `THE QP - Payment Failed for Prime #${prime}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; background: #000; color: #fff; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .error { background: rgba(255,0,0,0.1); padding: 20px; border-radius: 10px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 style="text-align: center;">THE QP</h1>
          <div class="error">
            <h2>Payment Failed</h2>
            <p>Your payment for Prime #${prime} could not be processed.</p>
            <p>Your reservation has been released.</p>
            <p style="margin-top: 30px;">
              <a href="${config.app.domain}" style="color: #fff;">Try again</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
THE QP - Payment Failed

Your payment for Prime #${prime} could not be processed.
Your reservation has been released.

Try again at: ${config.app.domain}
    `
  }),

  reminder: (prime, amount) => ({
    subject: `THE QP - Prime #${prime} is waiting for you`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; background: #000; color: #fff; }
          .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
          .reminder { background: rgba(255,255,255,0.05); padding: 30px; border-radius: 10px; text-align: center; }
          .prime-display { font-size: 48px; margin: 20px 0; }
          .cta { display: inline-block; padding: 15px 40px; background: #fff; color: #000; text-decoration: none; border-radius: 5px; font-weight: 600; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 style="text-align: center;">THE QP</h1>
          <div class="reminder">
            <h2>Your prime is waiting</h2>
            <div class="prime-display">#${prime}</div>
            <p>Price: $${amount}</p>
            <a href="${config.app.domain}" class="cta">Complete Your Claim</a>
            <p style="margin-top: 30px; opacity: 0.7;">
              This reservation expires in 1 hour
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
THE QP - Your prime is waiting

Prime #${prime} is reserved for you.
Price: $${amount}

Complete your claim at: ${config.app.domain}

This reservation expires in 1 hour.
    `
  })
};

// Send payment confirmation email
async function sendPaymentConfirmation(email, prime, amount) {
  const template = templates.paymentConfirmation(prime, amount);
  
  const command = new SendEmailCommand({
    Source: config.aws.ses.fromEmail,
    Destination: {
      ToAddresses: [email]
    },
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: template.subject
      },
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: template.html
        },
        Text: {
          Charset: 'UTF-8',
          Data: template.text
        }
      }
    }
  });
  
  try {
    const response = await sesClient.send(command);
    logger.info('Payment confirmation email sent', { email, prime, messageId: response.MessageId });
    return response;
  } catch (err) {
    logger.error('Failed to send payment confirmation email', { email, error: err.message });
    // Don't throw - email failure shouldn't break the payment flow
  }
}

// Send payment failed email
async function sendPaymentFailedEmail(email, prime) {
  const template = templates.paymentFailed(prime, email);
  
  const command = new SendEmailCommand({
    Source: config.aws.ses.fromEmail,
    Destination: {
      ToAddresses: [email]
    },
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: template.subject
      },
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: template.html
        },
        Text: {
          Charset: 'UTF-8',
          Data: template.text
        }
      }
    }
  });
  
  try {
    await sesClient.send(command);
    logger.info('Payment failed email sent', { email, prime });
  } catch (err) {
    logger.error('Failed to send payment failed email', { email, error: err.message });
  }
}

// Send reminder email
async function sendReminderEmail(email, prime, amount) {
  const template = templates.reminder(prime, amount);
  
  const command = new SendEmailCommand({
    Source: config.aws.ses.fromEmail,
    Destination: {
      ToAddresses: [email]
    },
    Message: {
      Subject: {
        Charset: 'UTF-8',
        Data: template.subject
      },
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: template.html
        },
        Text: {
          Charset: 'UTF-8',
          Data: template.text
        }
      }
    }
  });
  
  try {
    await sesClient.send(command);
    logger.info('Reminder email sent', { email, prime });
  } catch (err) {
    logger.error('Failed to send reminder email', { email, error: err.message });
  }
}

module.exports = {
  sendPaymentConfirmation,
  sendPaymentFailedEmail,
  sendReminderEmail
};