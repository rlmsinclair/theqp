-- THE QPAI Database Initialization
-- Run this after deployment

-- Execute the main schema
\i scripts/schema.sql

-- Verify setup
SELECT 'Total Primes Claimed:' as info, COUNT(*) as count FROM prime_claims;

\echo 'THE QPAI Database Ready! 🥧'