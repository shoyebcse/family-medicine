ALTER TABLE members ADD COLUMN phone VARCHAR(20);
ALTER TABLE members ADD COLUMN invite_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE members ADD COLUMN link_state VARCHAR(12) NOT NULL DEFAULT 'NONE';
ALTER TABLE members ADD COLUMN linked_account_id UUID REFERENCES accounts(id);
CREATE INDEX members_invite_phone_idx ON members(phone,link_state);
