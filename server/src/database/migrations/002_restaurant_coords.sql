-- Add address and coordinates to restaurants table
ALTER TABLE restaurants ADD COLUMN address TEXT NOT NULL DEFAULT 'Kyiv, Ukraine';
ALTER TABLE restaurants ADD COLUMN lat REAL NOT NULL DEFAULT 50.4501;
ALTER TABLE restaurants ADD COLUMN lng REAL NOT NULL DEFAULT 30.5234;
