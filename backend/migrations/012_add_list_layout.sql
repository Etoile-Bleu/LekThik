-- Where a list or a block sits on the free layout of its board: a 12 column grid, with the
-- position of the top left corner and the size in cells. All four are set together, or none
-- of them for a panel that has never been placed, which the clients then lay out themselves.
ALTER TABLE lists
  ADD COLUMN grid_x SMALLINT,
  ADD COLUMN grid_y SMALLINT,
  ADD COLUMN grid_w SMALLINT,
  ADD COLUMN grid_h SMALLINT,
  ADD CONSTRAINT lists_grid_placement CHECK (
    (grid_x IS NULL AND grid_y IS NULL AND grid_w IS NULL AND grid_h IS NULL)
    OR (
      grid_x >= 0 AND grid_y >= 0
      AND grid_w BETWEEN 1 AND 12
      AND grid_h BETWEEN 1 AND 100
      AND grid_x + grid_w <= 12
      AND grid_y + grid_h <= 400
    )
  );
