CREATE TABLE prescriptions (
 id UUID PRIMARY KEY, member_id UUID NOT NULL REFERENCES members(id), uploader_id UUID NOT NULL,
 command_key UUID NOT NULL, request_hash VARCHAR(64) NOT NULL, created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, status VARCHAR(30) NOT NULL, extraction TEXT NOT NULL, draft TEXT NOT NULL,
 UNIQUE(uploader_id, command_key)
);
CREATE TABLE prescription_sources (
 prescription_id UUID NOT NULL REFERENCES prescriptions(id), page_index INTEGER NOT NULL,
 media_type VARCHAR(30) NOT NULL, encrypted_data BYTEA NOT NULL,
 PRIMARY KEY(prescription_id,page_index)
);
CREATE TABLE patient_routines (
 member_id UUID PRIMARY KEY REFERENCES members(id), routine TEXT NOT NULL
);
CREATE TABLE prescription_originals (
 prescription_id UUID NOT NULL REFERENCES prescriptions(id), file_index INTEGER NOT NULL,
 media_type VARCHAR(30) NOT NULL, encrypted_data BYTEA NOT NULL, PRIMARY KEY(prescription_id,file_index)
);
CREATE TABLE prescription_plans (
 prescription_id UUID NOT NULL REFERENCES prescriptions(id), item_id UUID NOT NULL,
 schedule_id UUID NOT NULL REFERENCES schedules(id), PRIMARY KEY(prescription_id,item_id)
);
CREATE TABLE prescription_audit (
 id UUID PRIMARY KEY, prescription_id UUID NOT NULL REFERENCES prescriptions(id), actor_id UUID NOT NULL,
 action VARCHAR(30) NOT NULL, recorded_at TIMESTAMP WITH TIME ZONE NOT NULL, version INTEGER NOT NULL, snapshot TEXT NOT NULL
);
ALTER TABLE schedules ADD COLUMN discontinued BOOLEAN NOT NULL DEFAULT FALSE;
