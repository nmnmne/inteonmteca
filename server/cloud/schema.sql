CREATE TABLE IF NOT EXISTS chat_state (
    key Utf8 NOT NULL,
    value Utf8,
    expires_at Uint64,
    PRIMARY KEY (key)
) WITH (TTL = Interval("PT0S") ON expires_at AS SECONDS);
