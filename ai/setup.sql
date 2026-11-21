-- SkySketch v2 Snowflake setup (plan/ai.md §2). Run once: `node run_sql.js setup.sql` or paste into Snowsight.
-- CREATE OR REPLACE wipes the tables: fine until real games are stored. After that, don't re-run it.
CREATE DATABASE IF NOT EXISTS SKYSKETCH;
CREATE SCHEMA IF NOT EXISTS SKYSKETCH.GAME;
CREATE WAREHOUSE IF NOT EXISTS SKY_WH WITH WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 600 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = FALSE;
ALTER WAREHOUSE SKY_WH SET AUTO_SUSPEND = 600;   -- 10 minutes, so there's no cold start mid-demo
USE WAREHOUSE SKY_WH;
USE SCHEMA SKYSKETCH.GAME;

CREATE OR REPLACE TABLE GAMES (game_id STRING, room_code STRING, is_test BOOLEAN, created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP());
CREATE OR REPLACE TABLE TARGETS (shape_id NUMBER, name STRING, label STRING, difficulty NUMBER, is_round BOOLEAN, is_custom BOOLEAN DEFAULT FALSE);
CREATE OR REPLACE TABLE TARGET_POINTS (shape_id NUMBER, idx NUMBER, x FLOAT, y FLOAT);
CREATE OR REPLACE TABLE ATTEMPTS (attempt_id STRING, game_id STRING, round NUMBER, player_id STRING, shape_id NUMBER,
  is_bot BOOLEAN, n_raw_points NUMBER, n_strokes NUMBER, duration_ms NUMBER, submitted_at TIMESTAMP_NTZ,
  raw_strokes STRING,    -- JSON text: Snowflake rejects PARSE_JSON inside VALUES
  player_name STRING, is_practice BOOLEAN DEFAULT FALSE);   -- v3
CREATE OR REPLACE TABLE ATTEMPT_POINTS (attempt_id STRING, idx NUMBER, stroke NUMBER, x FLOAT, y FLOAT);
CREATE OR REPLACE TABLE SCORES (attempt_id STRING, accuracy FLOAT, on_line FLOAT, coverage FLOAT, final_score FLOAT,
  rank_in_round NUMBER, points_awarded NUMBER, guess_shape_id NUMBER, guess_score FLOAT, scorer STRING,
  scored_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP());
CREATE OR REPLACE TABLE CONFIG (k STRING, v FLOAT);
INSERT INTO CONFIG VALUES ('D_MAX', 0.35);   -- keep equal to backend/constants.js
INSERT INTO CONFIG VALUES ('FOV', 60);       -- v3, keep equal to backend/constants.js
CREATE STAGE IF NOT EXISTS SKY_IMAGES ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE') DIRECTORY = (ENABLE = TRUE);   -- stretch: vision
