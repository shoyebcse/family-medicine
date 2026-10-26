ALTER TABLE schedules ADD COLUMN low_stock_threshold DECIMAL(14,4);
ALTER TABLE schedules ADD CONSTRAINT low_stock_threshold_nonnegative CHECK (low_stock_threshold IS NULL OR low_stock_threshold>=0);
