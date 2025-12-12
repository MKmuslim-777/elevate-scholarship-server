const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const app = express();

const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

const uri = process.env.URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    await client.db("admin").command({ ping: 1 });

    const scholarshipDB = client.db("elevate_scholarship");
    const scholarshipCollection = scholarshipDB.collection("scholarships");

    app.get("/scholarships", async (req, res) => {
      const cursor = scholarshipCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });
  } finally {
  }
}

app.get("/", (req, res) => {
  res.send("Elevate Scholar Server");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

run().catch(console.dir);
