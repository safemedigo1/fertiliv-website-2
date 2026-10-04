-- Add analyteGroup and orderType to lab_dictionary
ALTER TABLE `lab_dictionary`
  ADD COLUMN `analyteGroup` varchar(256) NULL,
  ADD COLUMN `orderType` enum('Single Result Test','Timed Component','Protocol Name','Genetic / Molecular') NOT NULL DEFAULT 'Single Result Test';
