-- THE QPAI Database Initialization
-- Run this after deployment

-- Execute the main schema
\i scripts/schema.sql

-- Reserve Prime 2 for Robbie (founder's slice)
INSERT INTO prime_claims (prime_number, email, payment_status, payment_method, amount_paid, claimed_at)
VALUES (2, 'robbie@theqp.ai', 'paid', 'founder', 2, NOW())
ON CONFLICT (prime_number) DO NOTHING;

-- Reserve Prime 421 for Elon
INSERT INTO prime_reservations (prime_number, reserved_for, reason, reserved_at)
VALUES (421, 'elon@spacex.com', 'Mars - Reserved for when Mars is ready for humans', NOW())
ON CONFLICT (prime_number) DO NOTHING;

-- Verify setup
SELECT 'Prime 2 (Robbie):' as info, * FROM prime_claims WHERE prime_number = 2;
SELECT 'Prime 421 (Elon):' as info, * FROM prime_reservations WHERE prime_number = 421;
SELECT 'Total Primes Claimed:' as info, COUNT(*) as count FROM prime_claims;

\echo 'THE QPAI Database Ready! 🥧'