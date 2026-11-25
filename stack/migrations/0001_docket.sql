-- The docket's data (scripts/load-docket.ts writes it), the sign-up, and the
-- page counts. Read and written by the Worker in src/server/.

-- One row for each load. The current release is the one with the highest seq.
CREATE TABLE releases (
	seq INTEGER PRIMARY KEY,
	digest TEXT NOT NULL,
	schema_version TEXT NOT NULL,
	generated_at TEXT NOT NULL,
	window_start TEXT NOT NULL,
	window_end TEXT NOT NULL,
	upcoming_through TEXT NOT NULL,
	item_count INTEGER NOT NULL CHECK (item_count > 0),
	-- Counted by the load's last statement, from the items as stored.
	loaded_count INTEGER CHECK (loaded_count = item_count),
	shrink_reason TEXT,
	loaded_at TEXT NOT NULL
);

CREATE TABLE towns (
	slug TEXT PRIMARY KEY,
	town TEXT NOT NULL UNIQUE,
	platform TEXT NOT NULL,
	site TEXT NOT NULL
);

-- What is and is not collected of each board.
CREATE TABLE boards (
	town_slug TEXT NOT NULL REFERENCES towns (slug),
	position INTEGER NOT NULL,
	board TEXT NOT NULL,
	minutes_online TEXT NOT NULL,
	status TEXT NOT NULL,
	note TEXT,
	PRIMARY KEY (town_slug, position)
) WITHOUT ROWID;

CREATE TABLE meetings (
	id TEXT PRIMARY KEY,
	town_slug TEXT NOT NULL REFERENCES towns (slug),
	board TEXT NOT NULL,
	board_type TEXT NOT NULL,
	subbody TEXT,
	meeting_date TEXT NOT NULL,
	meeting_type TEXT NOT NULL,
	status TEXT NOT NULL,
	agenda_url TEXT,
	minutes_url TEXT,
	minutes_status TEXT NOT NULL,
	minutes_note TEXT,
	note TEXT,
	item_count INTEGER NOT NULL
);
CREATE INDEX meetings_town ON meetings (town_slug, meeting_date);

-- The bundle's items. It has no column for a raw name: applicant_display and
-- owner_display hold an organization, or a role for an individual.
CREATE TABLE items (
	id TEXT PRIMARY KEY,
	meeting_id TEXT NOT NULL REFERENCES meetings (id),
	town_slug TEXT NOT NULL REFERENCES towns (slug),
	board TEXT NOT NULL,
	board_type TEXT NOT NULL,
	subbody TEXT,
	meeting_date TEXT NOT NULL,
	meeting_type TEXT NOT NULL,
	kind TEXT NOT NULL,
	case_number TEXT,
	address TEXT,
	parcel TEXT,
	applicant_display TEXT,
	owner_display TEXT,
	request TEXT NOT NULL,
	status TEXT NOT NULL,
	status_label TEXT NOT NULL,
	outcome TEXT NOT NULL,
	quote TEXT NOT NULL CHECK (quote <> ''),
	source_type TEXT NOT NULL,
	source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
	source_ocr INTEGER NOT NULL,
	agenda_url TEXT,
	minutes_url TEXT,
	address_source_url TEXT,
	address_source_label TEXT,
	address_source_text TEXT,
	address_source_ocr INTEGER,
	collected_at TEXT NOT NULL
);
CREATE INDEX items_newest ON items (meeting_date DESC, town_slug, board, id);
CREATE INDEX items_meeting ON items (meeting_id);

-- An item a later release dropped: what its page still says, and nothing else.
CREATE TABLE withdrawn_items (
	id TEXT PRIMARY KEY,
	town TEXT NOT NULL,
	board TEXT NOT NULL,
	meeting_date TEXT NOT NULL,
	withdrawn_at TEXT NOT NULL
);

-- One row. Sign-up is closed as released.
CREATE TABLE settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	signup_open INTEGER NOT NULL CHECK (signup_open IN (0, 1))
);
INSERT INTO settings (id, signup_open) VALUES (1, 0);

-- One row for each submission, and nothing ties one to another. The same email
-- may be there several times: what is kept about one submission must not depend
-- on another, or an answer could say whether an address was there before.
CREATE TABLE signups (
	-- Never reused, so the lowest id of an email is its earliest row.
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL,
	role TEXT NOT NULL,
	-- A JSON array of town slugs.
	towns TEXT NOT NULL,
	-- The SHA-256 of the token the submission was given.
	token_hash TEXT NOT NULL UNIQUE,
	-- When this submission asked to be told of paid alerts.
	paid_intent_at INTEGER,
	created_at INTEGER NOT NULL
);
-- For counting (scripts/report-docket.ts). The Worker never asks by email.
CREATE INDEX signups_email ON signups (email, id);

-- The rolling limits: one row for each submission that took a place, kept an
-- hour. `client` is a keyed hash, never an address.
CREATE TABLE signup_attempts (
	id TEXT PRIMARY KEY,
	client TEXT NOT NULL,
	at INTEGER NOT NULL
);
CREATE INDEX signup_attempts_client ON signup_attempts (client, at);
CREATE INDEX signup_attempts_at ON signup_attempts (at);

-- Page requests by UTC day and kind of page, and refused sign-ups.
CREATE TABLE counters (
	day TEXT NOT NULL,
	kind TEXT NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (day, kind)
) WITHOUT ROWID;
