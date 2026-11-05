-- 0002: the types every table shares, and the trigger functions that keep rows as the sources
-- say they must stay (spec 31; T57).
--
-- Conventions for every table from here on:
--   - Every id is `app.id`, the contract's `Id` (packages/contracts/src/common.ts): made by the
--     API from at least 128 random bits, never a sequence, a UUID or anything time-ordered, so
--     nothing here generates one (T10, T15).
--   - A membership is addressed by its interval (`interval_id`, prefixed by its role: `star_`,
--     `author_`, `proposed_by_`), never by the account (TECH-DESIGN section 6; T8).
--   - No time column has a default: the API's time module gives every instant, after the locks,
--     so the dev clock and the fake clock reach them too (T1, T3; ADR-013).
--   - Enums are text with a CHECK, so a later migration widens one without rewriting a type (T57).
--   - A row that two clubs could share carries `club_id`, and its foreign keys include it, so no
--     row can tie one club's day, member or drop to another club's.
--   - Every table has row-level security on with no policy (0001; the runner checks it).

CREATE DOMAIN app.id AS text
  CHECK (VALUE ~ '^[A-Za-z0-9_-]{1,64}$');

-- A person's or a club's name, or a candidate's label (FQ70): the API counts the 40 grapheme
-- clusters and the visible character; this is the backstop. On the wire a name is at most 640
-- UTF-16 code units, and a string never has more code points than code units.
CREATE DOMAIN app.name AS text
  CHECK (
    pg_catalog.char_length(VALUE) BETWEEN 1 AND 640
    AND VALUE !~ '^\s'
    AND VALUE !~ '\s$'
    AND VALUE !~ '[\u0001-\u001F\u007F-\u009F؜‎‏ -‮⁦-⁩]'
  );

-- A row's version for optimistic concurrency (the contract's `Version`, T19).
CREATE DOMAIN app.version AS integer
  CHECK (VALUE >= 0);

-- A day that can be someone's day; Sunday never is (T6).
CREATE DOMAIN app.weekday AS text
  CHECK (VALUE IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'));

-- Refuses the operation outright: for rows that are written once (an audit trail, a sealed
-- audience), as BEFORE UPDATE OR DELETE, and as BEFORE TRUNCATE. Its argument says why.
CREATE FUNCTION app.refuse_change() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'app.%: % refused: %', TG_TABLE_NAME, pg_catalog.lower(TG_OP), TG_ARGV[0]
    USING ERRCODE = 'integrity_constraint_violation';
END
$$;

-- BEFORE UPDATE: the columns named as its arguments never change.
CREATE FUNCTION app.keep_columns() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  col text;
  before jsonb := pg_catalog.to_jsonb(OLD);
  after jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF NOT before ? col THEN
      RAISE EXCEPTION 'app.keep_columns: app.% has no column %', TG_TABLE_NAME, col;
    END IF;
    IF before -> col IS DISTINCT FROM after -> col THEN
      RAISE EXCEPTION 'app.%.% can''t change', TG_TABLE_NAME, col
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;

-- BEFORE UPDATE: the columns named as its arguments are set once, from null to a value, and
-- never change or go back to null after.
CREATE FUNCTION app.set_once() RETURNS trigger
  LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  col text;
  before jsonb := pg_catalog.to_jsonb(OLD);
  after jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF NOT before ? col THEN
      RAISE EXCEPTION 'app.set_once: app.% has no column %', TG_TABLE_NAME, col;
    END IF;
    IF before -> col <> 'null'::jsonb AND before -> col IS DISTINCT FROM after -> col THEN
      RAISE EXCEPTION 'app.%.% is set once and can''t change', TG_TABLE_NAME, col
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
