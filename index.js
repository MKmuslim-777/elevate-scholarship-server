const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const fs = require("fs");
const port = process.env.PORT || 3000;

const data = JSON.parse(fs.readFileSync("./firebase_SDK.json", "utf8"));
// console.log(data);

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
// const serviceAccount = JSON.parse(data);

admin.initializeApp({
  credential: admin.credential.cert(data),
});

// Middle Wares
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

// Verify Firebase Token

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  console.log(token);

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  try {
    const tokenId = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const scholarshipDB = client.db("elevate_scholarship");
const scholarshipCollection = scholarshipDB.collection("scholarships");
const studentsCollection = scholarshipDB.collection("students");
const usersCollection = scholarshipDB.collection("users");

// verify Admin role

const verifyAdmin = async (req, res, next) => {
  console.log(req.body);
  const email = req.body.postedUserEmail;
  console.log("verify Admin Email:", email);
  const query = { email };
  const user = await usersCollection.findOne(query);
  if (!user || user.role !== "admin") {
    return res.status(403).send({ message: "forbidden Access" });
  }

  next();
};

async function run() {
  try {
    // await client.connect();

    // await client.db("admin").command({ ping: 1 });

    // Scholarships related Apis

    app.get("/scholarships", async (req, res) => {
      const cursor = scholarshipCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/scholarships/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await scholarshipCollection.findOne(query);
      res.send(result);
    });

    // this is for post scholarship
    app.post("/scholarships", verifyAdmin, async (req, res) => {
      const scholarshipInfo = req.body;
      scholarshipInfo.createdAt = new Date();

      const result = await scholarshipCollection.insertOne(scholarshipInfo);
      res.send(result);
    });

    // User Related Apis here

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role || "user" });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "student";
      user.createdAt = new Date();

      const email = user.email;
      const userExists = await usersCollection.findOne({ email });
      if (userExists) {
        return res.send({ message: "user Exists" });
      }

      const result = await usersCollection.insertOne(user);
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
