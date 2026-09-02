-- Runs once when the postgres volume is empty.
-- Use for extensions, roles, seed schema. Real schema lives in TypeORM/migrations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
