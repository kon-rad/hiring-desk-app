CREATE TABLE IF NOT EXISTS cyba_accounts (
  wallet text PRIMARY KEY CHECK (wallet ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cyba_auth_challenges (
  id bigserial PRIMARY KEY, address text NOT NULL, nonce_hash text NOT NULL UNIQUE, message text NOT NULL,
  origin text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cyba_auth_challenges_expiry ON cyba_auth_challenges(expires_at);
CREATE TABLE IF NOT EXISTS cyba_sessions (
  token_hash text PRIMARY KEY, wallet text NOT NULL REFERENCES cyba_accounts(wallet) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cyba_sessions_wallet ON cyba_sessions(wallet);
CREATE TABLE IF NOT EXISTS cyba_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_wallet text NOT NULL REFERENCES cyba_accounts(wallet),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), bio text NOT NULL DEFAULT '' CHECK(length(bio)<=3000),
  skills text[] NOT NULL DEFAULT '{}', ens_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_wallet,name)
);
CREATE TABLE IF NOT EXISTS cyba_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_id uuid NOT NULL REFERENCES cyba_agents(id) ON DELETE CASCADE,
  owner_wallet text NOT NULL REFERENCES cyba_accounts(wallet), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  description text NOT NULL CHECK(length(description) BETWEEN 1 AND 5000), price_atomic numeric(78,0) NOT NULL CHECK(price_atomic>0),
  payout_wallet text NOT NULL CHECK(payout_wallet ~ '^0x[0-9a-f]{40}$'), ens_name text,
  status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','paused','archived')),
  revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cyba_listings_search ON cyba_listings USING gin(to_tsvector('english', name || ' ' || description));
CREATE INDEX IF NOT EXISTS cyba_listings_owner ON cyba_listings(owner_wallet,status);
CREATE TABLE IF NOT EXISTS cyba_listing_revisions (
  id bigserial PRIMARY KEY, listing_id uuid NOT NULL REFERENCES cyba_listings(id) ON DELETE CASCADE,
  revision integer NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(listing_id,revision)
);
CREATE OR REPLACE FUNCTION cyba_record_listing_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO cyba_listing_revisions(listing_id,revision,snapshot) VALUES(NEW.id,NEW.revision,to_jsonb(NEW));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cyba_listing_revision_trigger ON cyba_listings;
CREATE TRIGGER cyba_listing_revision_trigger AFTER INSERT OR UPDATE ON cyba_listings FOR EACH ROW EXECUTE FUNCTION cyba_record_listing_revision();
CREATE TABLE IF NOT EXISTS cyba_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), listing_id uuid NOT NULL REFERENCES cyba_listings(id),
  requester_wallet text NOT NULL REFERENCES cyba_accounts(wallet), idempotency_key text NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), description text NOT NULL CHECK(length(description) BETWEEN 1 AND 10000),
  attachment_refs jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(attachment_refs)='array'),
  listing_snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'submitted'
    CHECK(status IN ('submitted','accepted','rejected','in_progress','revision_requested','completed','cancelled')),
  provider_summary text, argo_card_id text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(requester_wallet,idempotency_key)
);
CREATE INDEX IF NOT EXISTS cyba_requests_listing ON cyba_requests(listing_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS cyba_requests_requester ON cyba_requests(requester_wallet,created_at DESC);
CREATE TABLE IF NOT EXISTS cyba_request_events (
  id bigserial PRIMARY KEY, request_id uuid NOT NULL REFERENCES cyba_requests(id) ON DELETE CASCADE,
  actor text NOT NULL, state text NOT NULL, summary text, idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS cyba_integrations (
  id text PRIMARY KEY, secret_hash text NOT NULL, listing_ids uuid[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
