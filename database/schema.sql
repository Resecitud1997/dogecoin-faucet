-- database/schema.sql
-- Dogecoin Faucet Database Schema

-- Drop existing tables
DROP TABLE IF EXISTS task_completions CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(64) UNIQUE NOT NULL,
    balance DECIMAL(20, 8) DEFAULT 0 CHECK (balance >= 0),
    total_earned DECIMAL(20, 8) DEFAULT 0,
    referral_code VARCHAR(20) UNIQUE,
    referred_by INTEGER REFERENCES users(id),
    email VARCHAR(255),
    last_login TIMESTAMP,
    is_banned BOOLEAN DEFAULT false,
    ban_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    reward DECIMAL(20, 8) NOT NULL CHECK (reward > 0),
    cooldown INTEGER DEFAULT 300 CHECK (cooldown > 0), -- seconds
    enabled BOOLEAN DEFAULT true,
    requires_captcha BOOLEAN DEFAULT true,
    max_daily_completions INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Task completions table
CREATE TABLE task_completions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    completed_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, task_id, completed_at)
);

-- Transactions table
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('earn', 'withdraw', 'referral', 'bonus')),
    amount DECIMAL(20, 8) NOT NULL CHECK (amount > 0),
    task_id INTEGER REFERENCES tasks(id),
    tx_hash VARCHAR(128),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

-- Referrals table
CREATE TABLE referrals (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    commission_rate DECIMAL(5, 2) DEFAULT 10.00,
    total_earned DECIMAL(20, 8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(referrer_id, referred_id)
);

-- Admin settings table
CREATE TABLE settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- IP tracking for fraud prevention
CREATE TABLE ip_tracking (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50),
    timestamp TIMESTAMP DEFAULT NOW()
);

-- Withdrawal requests table (for manual processing)
CREATE TABLE withdrawal_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount DECIMAL(20, 8) NOT NULL,
    wallet_address VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    admin_notes TEXT,
    requested_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    processed_by INTEGER REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_referral ON users(referral_code);
CREATE INDEX idx_task_completions_user ON task_completions(user_id);
CREATE INDEX idx_task_completions_task ON task_completions(task_id);
CREATE INDEX idx_task_completions_time ON task_completions(completed_at DESC);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_time ON transactions(created_at DESC);
CREATE INDEX idx_ip_tracking_ip ON ip_tracking(ip_address);
CREATE INDEX idx_ip_tracking_time ON ip_tracking(timestamp DESC);

-- Insert default tasks
INSERT INTO tasks (name, description, reward, cooldown, requires_captcha, max_daily_completions) VALUES
('Complete Captcha', 'Solve a simple captcha to earn DOGE', 0.50, 300, true, 20),
('Watch Advertisement', 'Watch a 30-second ad to earn DOGE', 0.30, 600, false, 15),
('Quick Survey', 'Complete a quick survey about crypto', 1.00, 1800, true, 5),
('Trivia Quiz', 'Answer crypto-related trivia questions', 0.80, 900, false, 10),
('Daily Login', 'Login once per day for a bonus', 2.00, 86400, false, 1),
('Share on Social Media', 'Share our faucet on Twitter or Facebook', 1.50, 43200, false, 2);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
('min_withdrawal', '5.0', 'Minimum withdrawal amount in DOGE'),
('max_withdrawal', '100.0', 'Maximum withdrawal amount in DOGE'),
('withdrawal_fee', '0.1', 'Withdrawal fee in DOGE'),
('referral_commission', '10.0', 'Referral commission percentage'),
('faucet_enabled', 'true', 'Enable/disable the entire faucet'),
('maintenance_mode', 'false', 'Put site in maintenance mode'),
('max_daily_claims', '50', 'Maximum claims per user per day'),
('captcha_enabled', 'true', 'Enable captcha verification'),
('min_balance_to_withdraw', '5.0', 'Minimum balance required to withdraw');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to process referral commissions
CREATE OR REPLACE FUNCTION process_referral_commission()
RETURNS TRIGGER AS $$
DECLARE
    referrer_user_id INTEGER;
    commission_amount DECIMAL(20, 8);
    commission_rate DECIMAL(5, 2);
BEGIN
    -- Only for 'earn' type transactions
    IF NEW.type = 'earn' AND NEW.status = 'completed' THEN
        -- Get referrer
        SELECT referred_by INTO referrer_user_id
        FROM users
        WHERE id = NEW.user_id AND referred_by IS NOT NULL;
        
        IF referrer_user_id IS NOT NULL THEN
            -- Get commission rate
            SELECT commission_rate INTO commission_rate
            FROM referrals
            WHERE referred_id = NEW.user_id
            LIMIT 1;
            
            IF commission_rate IS NULL THEN
                commission_rate := 10.0; -- Default 10%
            END IF;
            
            -- Calculate commission
            commission_amount := NEW.amount * (commission_rate / 100);
            
            -- Add commission to referrer
            UPDATE users
            SET balance = balance + commission_amount,
                total_earned = total_earned + commission_amount
            WHERE id = referrer_user_id;
            
            -- Create commission transaction
            INSERT INTO transactions (user_id, type, amount, status, notes)
            VALUES (referrer_user_id, 'referral', commission_amount, 'completed',
                    'Referral commission from user ' || NEW.user_id);
            
            -- Update referral stats
            UPDATE referrals
            SET total_earned = total_earned + commission_amount
            WHERE referred_id = NEW.user_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for referral commissions
CREATE TRIGGER referral_commission_trigger
AFTER INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION process_referral_commission();

-- View for admin dashboard statistics
CREATE OR REPLACE VIEW admin_stats AS
SELECT
    (SELECT COUNT(*) FROM users) as total_users,
    (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours') as new_users_24h,
    (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_7d,
    (SELECT SUM(balance) FROM users) as total_balance,
    (SELECT SUM(total_earned) FROM users) as total_earned,
    (SELECT COUNT(*) FROM transactions WHERE created_at > NOW() - INTERVAL '24 hours') as transactions_24h,
    (SELECT SUM(amount) FROM transactions WHERE type = 'withdraw' AND status = 'completed') as total_withdrawn,
    (SELECT COUNT(*) FROM task_completions WHERE completed_at > NOW() - INTERVAL '24 hours') as completions_24h;

-- View for user statistics
CREATE OR REPLACE VIEW user_stats AS
SELECT
    u.id,
    u.wallet_address,
    u.balance,
    u.total_earned,
    COUNT(DISTINCT tc.id) as total_tasks_completed,
    COUNT(DISTINCT CASE WHEN tc.completed_at > NOW() - INTERVAL '24 hours' THEN tc.id END) as tasks_today,
    (SELECT COUNT(*) FROM referrals WHERE referrer_id = u.id) as total_referrals,
    u.created_at,
    u.last_login
FROM users u
LEFT JOIN task_completions tc ON u.id = tc.user_id
GROUP BY u.id;

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO faucet_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO faucet_user;

-- Sample data for testing (optional)
-- INSERT INTO users (wallet_address, referral_code, balance) VALUES
-- ('DTestAddress1234567890123456789012345', 'TEST123', 10.5);

COMMENT ON TABLE users IS 'Stores user account information';
COMMENT ON TABLE tasks IS 'Available tasks users can complete to earn DOGE';
COMMENT ON TABLE task_completions IS 'Records of completed tasks by users';
COMMENT ON TABLE transactions IS 'All financial transactions (earnings, withdrawals, etc)';
COMMENT ON TABLE referrals IS 'Referral relationships between users';
COMMENT ON TABLE settings IS 'System-wide configuration settings';
COMMENT ON TABLE ip_tracking IS 'IP address tracking for fraud prevention';
COMMENT ON TABLE withdrawal_requests IS 'Manual withdrawal requests pending admin approval';
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(64) UNIQUE NOT NULL,
    balance DECIMAL(20, 8) DEFAULT 0,
    total_earned DECIMAL(20, 8) DEFAULT 0,
    referral_code VARCHAR(20) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type VARCHAR(20) NOT NULL, -- 'earn', 'withdraw'
    amount DECIMAL(20, 8) NOT NULL,
    task_id INTEGER,
    tx_hash VARCHAR(128),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    reward DECIMAL(20, 8) NOT NULL,
    cooldown INTEGER DEFAULT 300,
    enabled BOOLEAN DEFAULT true
);

CREATE TABLE task_completions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    task_id INTEGER REFERENCES tasks(id),
    completed_at TIMESTAMP DEFAULT NOW(),
    ip_address VARCHAR(45)
);
