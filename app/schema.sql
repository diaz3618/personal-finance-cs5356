-- Personal Expense Tracker schema
-- Run once in MySQL Workbench to create the database and seed default data.

CREATE DATABASE IF NOT EXISTS finance_tracker
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE finance_tracker;

DROP TABLE IF EXISTS Transactions;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Users;

CREATE TABLE Users (
  UserID    INT AUTO_INCREMENT PRIMARY KEY,
  FullName  VARCHAR(100) NOT NULL,
  Email     VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE Categories (
  CategoryID    INT AUTO_INCREMENT PRIMARY KEY,
  UserID        INT NOT NULL,
  CategoryName  VARCHAR(50) NOT NULL,
  CategoryType  ENUM('Income','Expense') NOT NULL,
  FOREIGN KEY (UserID) REFERENCES Users(UserID),
  UNIQUE KEY uniq_user_category (UserID, CategoryName)
);

CREATE TABLE Transactions (
  TransactionID    INT AUTO_INCREMENT PRIMARY KEY,
  UserID           INT NOT NULL,
  CategoryID       INT NOT NULL,
  Amount           DECIMAL(10,2) NOT NULL,
  TransactionDate  DATE NOT NULL,
  TransactionType  ENUM('Income','Expense') NOT NULL,
  Description      VARCHAR(255),
  FOREIGN KEY (UserID) REFERENCES Users(UserID),
  FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID)
);

-- Seed default user
INSERT INTO Users (FullName, Email) VALUES ('Default User', 'user@example.com');

-- Seed sample categories from the proposal sketches
INSERT INTO Categories (UserID, CategoryName, CategoryType) VALUES
  (1, 'Food',   'Expense'),
  (1, 'Rent',   'Expense'),
  (1, 'Gas',    'Expense'),
  (1, 'Salary', 'Income');

-- A few sample transactions for demo and report testing
INSERT INTO Transactions (UserID, CategoryID, Amount, TransactionDate, TransactionType, Description) VALUES
  (1, 1, 42.50,   '2026-04-03', 'Expense', 'Lunch at cafe'),
  (1, 1, 18.75,   '2026-04-15', 'Expense', 'Groceries'),
  (1, 2, 900.00,  '2026-04-01', 'Expense', 'April rent'),
  (1, 3, 60.00,   '2026-04-10', 'Expense', 'Gas fill-up'),
  (1, 4, 2500.00, '2026-04-05', 'Income',  'Monthly salary'),
  (1, 1, 30.00,   '2026-03-22', 'Expense', 'Dinner'),
  (1, 2, 900.00,  '2026-03-01', 'Expense', 'March rent'),
  (1, 4, 2500.00, '2026-03-05', 'Income',  'Monthly salary');
