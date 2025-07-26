-- THE QP Database Schema
-- PostgreSQL 15+
-- Supports both Bitcoin and Stripe payments

-- Create database (run as superuser)
-- CREATE DATABASE qpdb;

-- Connect to qpdb database
-- \c qpdb;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For email search optimization

-- Drop existing tables if needed (careful in production!)
-- DROP TABLE IF EXISTS bitcoin_payments CASCADE;
-- DROP TABLE IF EXISTS claim_audit CASCADE;
-- DROP TABLE IF EXISTS prime_claims CASCADE;

-- Create main prime claims table
CREATE TABLE prime_claims (
    prime_number BIGINT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    verification_token VARCHAR(64) UNIQUE,
    
    -- Payment fields
    payment_status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(20), -- 'stripe', 'bitcoin', or 'dogecoin'
    payment_intent_id VARCHAR(255) UNIQUE, -- Stripe payment intent ID
    bitcoin_payment_id UUID UNIQUE, -- Bitcoin payment ID
    dogecoin_payment_id UUID UNIQUE, -- Dogecoin payment ID
    paid_at TIMESTAMP WITH TIME ZONE,
    amount_paid INTEGER, -- Amount in dollars
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    
    -- Constraints
    CONSTRAINT unique_email UNIQUE (email),
    CONSTRAINT valid_prime CHECK (prime_number >= 2),
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_payment_status CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    CONSTRAINT valid_payment_method CHECK (payment_method IN ('stripe', 'bitcoin', 'dogecoin'))
);

-- Create Bitcoin payments table
CREATE TABLE bitcoin_payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prime_number BIGINT NOT NULL REFERENCES prime_claims(prime_number),
    email VARCHAR(255) NOT NULL,
    address VARCHAR(100) NOT NULL UNIQUE,
    amount_btc DECIMAL(16, 8) NOT NULL,
    amount_usd INTEGER NOT NULL,
    btc_price DECIMAL(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    confirmations INTEGER DEFAULT 0,
    tx_hash VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    CONSTRAINT valid_btc_status CHECK (status IN ('pending', 'confirmed', 'expired', 'failed'))
);

-- Create Dogecoin payments table
CREATE TABLE dogecoin_payments (
    payment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prime_number BIGINT NOT NULL REFERENCES prime_claims(prime_number),
    email VARCHAR(255) NOT NULL,
    address VARCHAR(100) NOT NULL UNIQUE,
    amount_doge DECIMAL(16, 2) NOT NULL,
    amount_usd INTEGER NOT NULL,
    doge_price DECIMAL(12, 6) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    confirmations INTEGER DEFAULT 0,
    tx_hash VARCHAR(100),
    is_meme_amount BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    CONSTRAINT valid_doge_status CHECK (status IN ('pending', 'confirmed', 'expired', 'failed'))
);

-- Create indexes for performance
CREATE INDEX idx_email ON prime_claims USING btree (lower(email));
CREATE INDEX idx_payment_intent ON prime_claims USING hash (payment_intent_id);
CREATE INDEX idx_bitcoin_payment ON prime_claims USING hash (bitcoin_payment_id);
CREATE INDEX idx_dogecoin_payment ON prime_claims USING hash (dogecoin_payment_id);
CREATE INDEX idx_payment_status ON prime_claims (payment_status);
CREATE INDEX idx_payment_method ON prime_claims (payment_method);
CREATE INDEX idx_paid_at ON prime_claims (paid_at DESC) WHERE payment_status = 'paid';
CREATE INDEX idx_claimed_at ON prime_claims (claimed_at DESC);
CREATE INDEX idx_email_trgm ON prime_claims USING gin (email gin_trgm_ops);

-- Bitcoin payment indexes
CREATE INDEX idx_btc_address ON bitcoin_payments USING hash (address);
CREATE INDEX idx_btc_status ON bitcoin_payments (status);
CREATE INDEX idx_btc_expires ON bitcoin_payments (expires_at) WHERE status = 'pending';

-- Dogecoin payment indexes
CREATE INDEX idx_doge_address ON dogecoin_payments USING hash (address);
CREATE INDEX idx_doge_status ON dogecoin_payments (status);
CREATE INDEX idx_doge_expires ON dogecoin_payments (expires_at) WHERE status = 'pending';
CREATE INDEX idx_doge_meme ON dogecoin_payments (is_meme_amount) WHERE is_meme_amount = true;

-- Create audit table
CREATE TABLE claim_audit (
    id SERIAL PRIMARY KEY,
    prime_number BIGINT NOT NULL,
    email VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    details JSONB,
    CONSTRAINT valid_action CHECK (action IN (
        'claim_created', 
        'claim_reserved', 
        'payment_completed', 
        'payment_failed', 
        'claim_refunded',
        'bitcoin_payment_created',
        'bitcoin_payment_confirmed',
        'dogecoin_payment_created',
        'dogecoin_payment_confirmed'
    ))
);

CREATE INDEX idx_audit_email ON claim_audit (email);
CREATE INDEX idx_audit_timestamp ON claim_audit (timestamp DESC);
CREATE INDEX idx_audit_action ON claim_audit (action);

-- Create function for audit logging
CREATE OR REPLACE FUNCTION log_claim_action()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO claim_audit (prime_number, email, action, ip_address, details)
        VALUES (NEW.prime_number, NEW.email, 'claim_reserved', NEW.ip_address, 
                jsonb_build_object(
                    'payment_method', NEW.payment_method,
                    'user_agent', NEW.user_agent
                ));
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.payment_status = 'pending' AND NEW.payment_status = 'paid' THEN
            INSERT INTO claim_audit (prime_number, email, action, details)
            VALUES (NEW.prime_number, NEW.email, 'payment_completed', 
                    jsonb_build_object(
                        'payment_method', NEW.payment_method,
                        'amount_paid', NEW.amount_paid,
                        'paid_at', NEW.paid_at
                    ));
        ELSIF OLD.payment_status != 'failed' AND NEW.payment_status = 'failed' THEN
            INSERT INTO claim_audit (prime_number, email, action, details)
            VALUES (NEW.prime_number, NEW.email, 'payment_failed', 
                    jsonb_build_object(
                        'payment_method', NEW.payment_method,
                        'failed_at', CURRENT_TIMESTAMP
                    ));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for audit logging
CREATE TRIGGER claim_audit_trigger
AFTER INSERT OR UPDATE ON prime_claims
FOR EACH ROW EXECUTE FUNCTION log_claim_action();

-- Bitcoin payment audit function
CREATE OR REPLACE FUNCTION log_bitcoin_payment_action()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO claim_audit (prime_number, email, action, details)
        VALUES (NEW.prime_number, NEW.email, 'bitcoin_payment_created', 
                jsonb_build_object(
                    'payment_id', NEW.payment_id,
                    'address', NEW.address,
                    'amount_btc', NEW.amount_btc,
                    'amount_usd', NEW.amount_usd,
                    'btc_price', NEW.btc_price
                ));
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
        INSERT INTO claim_audit (prime_number, email, action, details)
        VALUES (NEW.prime_number, NEW.email, 'bitcoin_payment_confirmed', 
                jsonb_build_object(
                    'payment_id', NEW.payment_id,
                    'tx_hash', NEW.tx_hash,
                    'confirmations', NEW.confirmations,
                    'confirmed_at', NEW.confirmed_at
                ));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for Bitcoin payment audit
CREATE TRIGGER bitcoin_payment_audit_trigger
AFTER INSERT OR UPDATE ON bitcoin_payments
FOR EACH ROW EXECUTE FUNCTION log_bitcoin_payment_action();

-- Create view for statistics
CREATE VIEW prime_statistics AS
SELECT 
    COUNT(*) as total_claims,
    COUNT(*) FILTER (WHERE verified = true) as verified_claims,
    COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_claims,
    COUNT(*) FILTER (WHERE payment_status = 'pending') as pending_claims,
    COUNT(*) FILTER (WHERE payment_status = 'failed') as failed_claims,
    COUNT(*) FILTER (WHERE payment_method = 'stripe') as stripe_payments,
    COUNT(*) FILTER (WHERE payment_method = 'bitcoin') as bitcoin_payments,
    SUM(amount_paid) as total_revenue,
    SUM(amount_paid) FILTER (WHERE payment_method = 'stripe') as stripe_revenue,
    SUM(amount_paid) FILTER (WHERE payment_method = 'bitcoin') as bitcoin_revenue,
    AVG(amount_paid) FILTER (WHERE amount_paid IS NOT NULL) as average_price,
    MAX(prime_number) FILTER (WHERE payment_status = 'paid') as highest_paid_prime,
    MIN(claimed_at) as first_claim_date,
    MAX(claimed_at) as latest_claim_date
FROM prime_claims;

-- Create view for recent activity
CREATE VIEW recent_activity AS
SELECT 
    p.prime_number,
    p.email,
    p.payment_status,
    p.payment_method,
    p.amount_paid,
    p.claimed_at,
    p.paid_at,
    a.action,
    a.timestamp as action_timestamp,
    a.details
FROM prime_claims p
LEFT JOIN claim_audit a ON p.prime_number = a.prime_number
ORDER BY COALESCE(a.timestamp, p.claimed_at) DESC
LIMIT 100;

-- Create view for Bitcoin payment status
CREATE VIEW bitcoin_payment_status AS
SELECT 
    bp.payment_id,
    bp.prime_number,
    bp.email,
    bp.address,
    bp.amount_btc,
    bp.amount_usd,
    bp.btc_price,
    bp.status,
    bp.confirmations,
    bp.tx_hash,
    bp.created_at,
    bp.expires_at,
    CASE 
        WHEN bp.status = 'pending' AND bp.expires_at < CURRENT_TIMESTAMP THEN 'expired'
        ELSE bp.status
    END as current_status,
    pc.payment_status as claim_status
FROM bitcoin_payments bp
JOIN prime_claims pc ON bp.prime_number = pc.prime_number;

-- Function to clean up abandoned reservations
CREATE OR REPLACE FUNCTION cleanup_abandoned_reservations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete pending claims older than 1 hour (except prime 2)
    DELETE FROM prime_claims
    WHERE payment_status = 'pending'
    AND claimed_at < NOW() - INTERVAL '1 hour'
    AND prime_number NOT IN (2)
    AND payment_intent_id IS NULL
    AND bitcoin_payment_id IS NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Mark expired Bitcoin payments
    UPDATE bitcoin_payments
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at < CURRENT_TIMESTAMP;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- Grant permissions (adjust username as needed)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO qpuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO qpuser;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO qpuser;

-- Create read-only user for analytics (optional)
-- CREATE USER qpanalytics WITH PASSWORD 'analytics_password';
-- GRANT CONNECT ON DATABASE qpdb TO qpanalytics;
-- GRANT USAGE ON SCHEMA public TO qpanalytics;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO qpanalytics;