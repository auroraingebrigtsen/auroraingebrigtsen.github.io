// @ts-check
// This is a simple server with no sessions/login
// Only for testing with no restrictions on sql
// Will execute drop tables if asked ...

const CONNECTSTRING = "postgres://shop:123@localhost/shop";
const PORT = 3000;
const express = require("express");
const pgp = require("pg-promise")();
const db = pgp(CONNECTSTRING);
const app = express();
const bodyParser = require("body-parser");
const fs = require('fs');

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


app.post("/runsql", function(req, res) {
  let data = req.body;
  runsql(res, data);
});

app.listen(3000, function() {
  console.log(`Really unsafe server started. Users can
  drop all tables - no questions asked.
  Connect at http://localhost:${PORT}`);
});

async function runsql(res, obj) {
  let results;
  let sql = obj.sql;
  let data = obj.data;
  await db
    .any(sql, data)
    .then(data => {
      results = data;
    })
    .catch(error => {
      console.log("ERROR:", sql, ":", error.message); 
      results = { error: error.message };
    });
  res.send({ results });
}