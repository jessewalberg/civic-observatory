-- Collection guards isolate unrelated writers; public reads never conflict.
CREATE TABLE app_collection_versions(collection TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO app_collection_versions(collection) VALUES ('users'),('municipalities'),('coverageRequests'),('meetings'),('summaries'),('subscriptions'),('alerts'),('scrapeJobs'),('scraperValidationRuns'),('coveragePublicationEvents'),('usageRecords');
CREATE TABLE app_write_guard(id INTEGER PRIMARY KEY CHECK(id=1));
INSERT INTO app_write_guard VALUES(1);
DROP TABLE app_revision;
CREATE TRIGGER app_versions_insert AFTER INSERT ON app_records BEGIN
 UPDATE app_collection_versions SET revision=revision+1 WHERE collection=new.collection;
END;
CREATE TRIGGER app_versions_update AFTER UPDATE ON app_records BEGIN
 UPDATE app_collection_versions SET revision=revision+1 WHERE collection=old.collection OR collection=new.collection;
END;
CREATE TRIGGER app_versions_delete AFTER DELETE ON app_records BEGIN
 UPDATE app_collection_versions SET revision=revision+1 WHERE collection=old.collection;
END;

ALTER TABLE jobs ADD COLUMN state TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE jobs ADD COLUMN token TEXT;
ALTER TABLE jobs ADD COLUMN started_at INTEGER;
ALTER TABLE jobs ADD COLUMN finished_at INTEGER;
UPDATE jobs SET state=CASE WHEN lease_until IS NOT NULL THEN 'running' WHEN attempts>0 THEN 'failed' ELSE 'pending' END,
 started_at=CASE WHEN lease_until IS NOT NULL THEN lease_until-600000 ELSE NULL END,
 error=CASE WHEN attempts>0 THEN COALESCE(error,'Previous worker attempt did not record its result; reconcile external effects before retrying') ELSE error END;
UPDATE jobs SET lease_until=started_at+1200000 WHERE state='running';
CREATE INDEX jobs_claimable ON jobs(state,due_at);
CREATE TABLE job_attempts(job_id TEXT NOT NULL REFERENCES jobs(id),attempt INTEGER NOT NULL,state TEXT NOT NULL,error TEXT,started_at INTEGER NOT NULL,finished_at INTEGER,reconciliation TEXT,PRIMARY KEY(job_id,attempt));
INSERT INTO job_attempts(job_id,attempt,state,error,started_at) SELECT id,attempts,state,error,COALESCE(started_at,due_at) FROM jobs WHERE attempts>0;

-- The receipt and its entitlement update share one transactional D1 batch.
CREATE TABLE stripe_events(event_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,received_at INTEGER NOT NULL);
