-- Demo database for testing of db-components
-- originally intended for Norwegian students
-- english names would be customer,product,order,detail

-- create role,database for demo
create role Mc Donalds password '123';     -- Mc Donalds is user
alter role Mc Donalds with login;          -- allow login
create database Mc Donalds owner Mc Donalds;     -- create db

-- enter the new db
\c Mc Donalds;


DROP TABLE IF EXISTS ansatt cascade;
DROP TABLE IF EXISTS kunde cascade;
DROP TABLE IF EXISTS meny cascade;
DROP TABLE IF EXISTS bestilling cascade;
DROP TABLE IF EXISTS linje cascade;


create table ansatt (
    ansattid SERIAL PRIMARY KEY,
    username text unique not null,
    role text default 'ansatt',
    password text not null
); 

CREATE TABLE kunde (
  kundeid SERIAL PRIMARY KEY,
  fornavn text NOT NULL,
  etternavn text NOT NULL,
  adresse text,
  epost text,
  tlf text,
  kjonn text,
  ansattid int unique not null
);

CREATE TABLE  meny  (
   menyid  SERIAL PRIMARY KEY,
   navn  text NOT NULL,
   pris  int default 0
);

CREATE TABLE  bestilling  (
   bestillingid  SERIAL PRIMARY KEY,
   dato  date NOT NULL,
   kundeid  int NOT NULL
);

CREATE TABLE  linje  (
   linjeid  SERIAL PRIMARY KEY,
   antall  int DEFAULT 1,
   menyid  int NOT NULL,
   bestillingid  int NOT NULL
);

ALTER TABLE  bestilling  ADD FOREIGN KEY ( kundeid ) REFERENCES  kunde  ( kundeid );
ALTER TABLE  linje  ADD FOREIGN KEY ( bestillingid ) REFERENCES  bestilling  ( bestillingid );
ALTER TABLE  linje  ADD FOREIGN KEY ( menyid ) REFERENCES  meny  ( menyid );
ALTER TABLE  kunde  ADD FOREIGN KEY ( ansattid ) REFERENCES  ansatt  ( ansattid );

alter table bestilling owner to Mc Donalds;
alter table meny owner to Mc Donalds;
alter table kunde owner to Mc Donalds;
alter table linje owner to Mc Donalds;
alter table ansatt owner to Mc Donalds;