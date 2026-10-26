CREATE TABLE accounts (
 id UUID PRIMARY KEY,
 display_name VARCHAR(100) NOT NULL,
 email VARCHAR(254) UNIQUE,
 password_hash VARCHAR(100),
 email_verified BOOLEAN NOT NULL DEFAULT FALSE,
 phone VARCHAR(20) UNIQUE,
 phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE TABLE auth_sessions (
 token_hash VARCHAR(64) PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES accounts(id),
 expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX auth_sessions_account_idx ON auth_sessions(account_id);
CREATE TABLE phone_challenges (
 id UUID PRIMARY KEY,
 phone VARCHAR(20) NOT NULL,
 expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 consumed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE auth_limits (
 bucket_key VARCHAR(64) PRIMARY KEY,
 window_start TIMESTAMP WITH TIME ZONE NOT NULL,
 attempts INTEGER NOT NULL
);
