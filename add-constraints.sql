
ALTER TABLE aso_entries 
  ADD CONSTRAINT valid_ranking CHECK (ranking >= 0),
  ADD CONSTRAINT valid_installs CHECK (installs >= 0),
  ADD CONSTRAINT valid_cpi CHECK (cpi >= 0 AND cpi <= 1000);

