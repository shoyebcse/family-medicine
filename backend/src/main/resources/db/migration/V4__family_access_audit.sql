CREATE TABLE family_access_events (
 id UUID PRIMARY KEY,
 member_id UUID NOT NULL REFERENCES members(id),
 actor_id UUID NOT NULL,
 action VARCHAR(24) NOT NULL,
 recorded_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX family_access_events_member_idx ON family_access_events(member_id,recorded_at);
