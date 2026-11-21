-- SkySketch: Snowflake foundation (database, warehouse, tables).
-- Run once in Snowsight (or snowsql). Safe to re-run: everything is IF NOT EXISTS.
-- Scoring SQL is NOT here yet: the final plan may change the scoring rules.

CREATE WAREHOUSE IF NOT EXISTS SKYSKETCH_WH
  WAREHOUSE_SIZE = 'XSMALL'
  AUTO_SUSPEND = 60          -- seconds idle before it switches off (saves credits)
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE;

CREATE DATABASE IF NOT EXISTS SKYSKETCH;
USE DATABASE SKYSKETCH;
CREATE SCHEMA IF NOT EXISTS GAME;
USE SCHEMA GAME;
USE WAREHOUSE SKYSKETCH_WH;

-- One row per game room (4-letter code shown on the big screen).
CREATE TABLE IF NOT EXISTS rooms (
  code        STRING        NOT NULL PRIMARY KEY,
  status      STRING        DEFAULT 'lobby',   -- lobby | playing | ended
  rounds      INTEGER       DEFAULT 3,
  created_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Players who joined a room from their phone.
CREATE TABLE IF NOT EXISTS players (
  player_id   STRING        NOT NULL PRIMARY KEY,
  room_code   STRING        NOT NULL,
  name        STRING        NOT NULL,
  joined_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Target shapes (from ai/shapes.json): points = [[x,y], ...] 64 points in 0..1.
CREATE TABLE IF NOT EXISTS targets (
  shape_id    STRING        NOT NULL PRIMARY KEY,  -- circle | triangle | star
  points      VARIANT       NOT NULL
);

-- One traced path per player per round. points = [[x,y], ...] in 0..1, as sent by the phone.
CREATE TABLE IF NOT EXISTS attempts (
  attempt_id  STRING        DEFAULT UUID_STRING() PRIMARY KEY,
  room_code   STRING        NOT NULL,
  player_id   STRING        NOT NULL,
  round       INTEGER       NOT NULL,
  shape_id    STRING        NOT NULL,
  points      VARIANT       NOT NULL,
  created_at  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Result of scoring an attempt. Filled by the scoring step (added once the final plan is fixed).
CREATE TABLE IF NOT EXISTS scores (
  attempt_id   STRING        NOT NULL PRIMARY KEY,
  room_code    STRING        NOT NULL,
  player_id    STRING        NOT NULL,
  round        INTEGER       NOT NULL,
  accuracy     FLOAT,
  smoothness   FLOAT,
  score        FLOAT,
  round_points INTEGER,        -- 300 / 200 / 100 / 50
  comment      STRING,         -- AI_COMPLETE one-liner
  scored_at    TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
-- Note: Snowflake does not enforce PRIMARY KEY; it is documentation only.
