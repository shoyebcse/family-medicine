ALTER TABLE accounts ADD COLUMN google_subject VARCHAR(255) UNIQUE;

CREATE TABLE google_sign_ins (
    state_hash VARCHAR(64) PRIMARY KEY,
    client_hash VARCHAR(64) NOT NULL,
    nonce VARCHAR(43) NOT NULL,
    verifier VARCHAR(43) NOT NULL,
    web BOOLEAN NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    callback_started BOOLEAN NOT NULL DEFAULT FALSE,
    ticket_hash VARCHAR(64) UNIQUE,
    google_subject VARCHAR(255),
    email VARCHAR(254),
    display_name VARCHAR(100)
);
CREATE INDEX google_sign_ins_expiry_idx ON google_sign_ins(expires_at);
