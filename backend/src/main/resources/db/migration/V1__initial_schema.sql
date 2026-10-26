CREATE TABLE members (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL,
 name VARCHAR(100) NOT NULL,
 relationship VARCHAR(50) NOT NULL,
 created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX members_owner_idx ON members(owner_id);

CREATE TABLE schedules (
 id UUID PRIMARY KEY,
 member_id UUID NOT NULL REFERENCES members(id),
 version INTEGER NOT NULL DEFAULT 1,
 medicine_name VARCHAR(150) NOT NULL,
 strength VARCHAR(100) NOT NULL,
 dose_instruction VARCHAR(300) NOT NULL,
 dose_quantity DECIMAL(14,4),
 unit VARCHAR(30) NOT NULL,
 times VARCHAR(200) NOT NULL,
 weekdays VARCHAR(30) NOT NULL,
 timezone VARCHAR(80) NOT NULL,
 start_date DATE NOT NULL,
 end_date DATE,
 activated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 stock DECIMAL(14,4),
 CONSTRAINT quantity_positive CHECK (dose_quantity IS NULL OR dose_quantity > 0)
);
CREATE INDEX schedules_member_idx ON schedules(member_id);

CREATE TABLE schedule_commands (
 actor_id UUID NOT NULL,
 command_key UUID NOT NULL,
 request_hash VARCHAR(64) NOT NULL,
 schedule_id UUID NOT NULL REFERENCES schedules(id),
 PRIMARY KEY(actor_id, command_key)
);

CREATE TABLE occurrences (
 id UUID PRIMARY KEY,
 schedule_id UUID NOT NULL REFERENCES schedules(id),
 schedule_version INTEGER NOT NULL,
 due_at TIMESTAMP WITH TIME ZONE NOT NULL,
 local_date DATE NOT NULL,
 local_time VARCHAR(5) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 actual_at TIMESTAMP WITH TIME ZONE,
 CONSTRAINT occurrence_slot UNIQUE(schedule_id, schedule_version, local_date, local_time)
);
CREATE INDEX occurrences_due_idx ON occurrences(due_at);

CREATE TABLE dose_events (
 event_id UUID PRIMARY KEY,
 occurrence_id UUID NOT NULL REFERENCES occurrences(id),
 actor_id UUID NOT NULL,
 action VARCHAR(10) NOT NULL,
 actual_at TIMESTAMP WITH TIME ZONE,
 received_at TIMESTAMP WITH TIME ZONE NOT NULL,
 stock_delta DECIMAL(14,4) NOT NULL,
 request_hash VARCHAR(64) NOT NULL
);
