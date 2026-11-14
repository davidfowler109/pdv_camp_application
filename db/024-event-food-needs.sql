ALTER TABLE event_attendee ADD COLUMN IF NOT EXISTS food_answer text CHECK (food_answer IN ('none','yes','unknown'));
ALTER TABLE event_attendee ADD COLUMN IF NOT EXISTS diet_answer text CHECK (diet_answer IN ('none','yes','unknown'));
ALTER TABLE event_attendee ADD COLUMN IF NOT EXISTS diet text;
