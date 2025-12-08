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
