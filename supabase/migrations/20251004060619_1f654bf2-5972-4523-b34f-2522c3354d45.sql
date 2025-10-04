-- Enable realtime for wines table
ALTER TABLE wines REPLICA IDENTITY FULL;

-- Add wines table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE wines;