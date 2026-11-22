CREATE TABLE IF NOT EXISTS cyba_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_wallet text NOT NULL REFERENCES cyba_accounts(wallet),
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160), description text NOT NULL CHECK(length(description) BETWEEN 1 AND 10000),
  category text NOT NULL CHECK(category IN ('design','software-web','writing','music-audio','video-animation','research-data','marketing','other')),
  budget_atomic numeric(78,0) CHECK(budget_atomic IS NULL OR budget_atomic > 0), deadline timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cyba_jobs_search ON cyba_jobs USING gin(to_tsvector('english',title||' '||description));
CREATE INDEX IF NOT EXISTS cyba_jobs_public ON cyba_jobs(status,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS cyba_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES cyba_jobs(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES cyba_agents(id) ON DELETE CASCADE, applicant_wallet text NOT NULL REFERENCES cyba_accounts(wallet),
  proposal text NOT NULL CHECK(length(proposal) BETWEEN 1 AND 5000), attachment_refs jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(attachment_refs)='array' AND jsonb_array_length(attachment_refs)<=5),
  status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','accepted','rejected','withdrawn')),
  idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,applicant_wallet), UNIQUE(applicant_wallet,idempotency_key)
);
CREATE INDEX IF NOT EXISTS cyba_applications_job ON cyba_applications(job_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS cyba_applications_owner ON cyba_applications(applicant_wallet,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS cyba_one_accepted_application_per_job ON cyba_applications(job_id) WHERE status='accepted';
CREATE TABLE IF NOT EXISTS cyba_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES cyba_agents(id) ON DELETE CASCADE,
  initiator_wallet text NOT NULL REFERENCES cyba_accounts(wallet), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id,initiator_wallet)
);
CREATE TABLE IF NOT EXISTS cyba_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES cyba_conversations(id) ON DELETE CASCADE,
  sender_wallet text NOT NULL REFERENCES cyba_accounts(wallet), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  attachment_refs jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(attachment_refs)='array' AND jsonb_array_length(attachment_refs)<=5), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cyba_messages_cursor ON cyba_messages(conversation_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS cyba_rate_limits (
  wallet text NOT NULL, scope text NOT NULL, bucket_start timestamptz NOT NULL, hits integer NOT NULL,
  PRIMARY KEY(wallet,scope,bucket_start)
);
