const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const YOUR_DOMAIN = process.env.SITE_DOMAIN;

const app = express();
const port = process.env.PORT || 3000;

try {
  const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
    "utf8"
  );
  const serviceAccount = JSON.parse(decoded);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("Firebase Admin initialized successfully");
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error.message);
  process.exit(1);
}

// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:5173"],
    credentials: true,
  })
);

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tnbzfze.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Collections (will be initialized after connection)
let scholarshipCollection;
let studentsCollection;
let usersCollection;
let reviewsCollection;
let applicationsCollection;

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token || !token.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const tokenId = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId);
    req.decoded_email = decoded.email;
    req.decoded_uid = decoded.uid;
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const verifyAdmin = async (req, res, next) => {
  const email = req.decoded_email; // Get from decoded token
  console.log(email);

  try {
    const user = await usersCollection.findOne({ email });

    if (!user || user.role !== "admin") {
      return res.status(403).send({ message: "forbidden access" });
    }

    next();
  } catch (error) {
    console.error("Admin verification error:", error.message);
    return res.status(500).send({ message: "internal server error" });
  }
};

async function run() {
  try {
    // Initialize collections
    const scholarshipDB = client.db("elevate_scholarship");
    scholarshipCollection = scholarshipDB.collection("scholarships");
    studentsCollection = scholarshipDB.collection("students");
    usersCollection = scholarshipDB.collection("users");
    reviewsCollection = scholarshipDB.collection("reviews");
    applicationsCollection = scholarshipDB.collection("applications");

    // ==================== Scholarship Related APIs ====================

    // Get all scholarships (Public)
    app.get("/scholarships", async (req, res) => {
      const searchText = req.query.filter;
      const query = {};
      if (searchText) {
        query.$or = [
          { universityName: { $regex: searchText, $options: "i" } },
          { scholarshipName: { $regex: searchText, $options: "i" } },
          { degree: { $regex: searchText, $options: "i" } },
        ];
      }

      const cursor = scholarshipCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(10);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get single scholarship by ID (Public)
    app.get("/scholarships/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid scholarship ID" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await scholarshipCollection.findOne(query);

        if (!result) {
          return res.status(404).send({ message: "Scholarship not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error fetching scholarship:", error);
        res.status(500).send({ message: "Failed to fetch scholarship" });
      }
    });

    // Create new scholarship (Admin only)
    app.post("/scholarships", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const scholarshipInfo = req.body;
        scholarshipInfo.createdAt = new Date();
        scholarshipInfo.createdBy = req.decoded_email;

        const result = await scholarshipCollection.insertOne(scholarshipInfo);
        res.send(result);
      } catch (error) {
        console.error("Error creating scholarship:", error);
        res.status(500).send({ message: "Failed to create scholarship" });
      }
    });

    // Update scholarship (Admin only)
    app.patch(
      "/scholarships/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;

          if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid scholarship ID" });
          }

          const updateData = req.body;
          const query = { _id: new ObjectId(id) };

          const updatedDoc = {
            $set: {
              ...updateData,
              updatedAt: new Date(),
            },
          };

          const result = await scholarshipCollection.updateOne(
            query,
            updatedDoc
          );

          if (result.matchedCount === 0) {
            return res.status(404).send({ message: "Scholarship not found" });
          }

          res.send(result);
        } catch (error) {
          console.error("Error updating scholarship:", error);
          res.status(500).send({ message: "Failed to update scholarship" });
        }
      }
    );

    // Delete scholarship (Admin only)
    app.delete(
      "/scholarships/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;

          if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid scholarship ID" });
          }

          const query = { _id: new ObjectId(id) };
          const result = await scholarshipCollection.deleteOne(query);

          if (result.deletedCount === 0) {
            return res.status(404).send({ message: "Scholarship not found" });
          }

          res.send(result);
        } catch (error) {
          console.error("Error deleting scholarship:", error);
          res.status(500).send({ message: "Failed to delete scholarship" });
        }
      }
    );

    // ==================== Review Related APIs ====================

    // Get reviews (with optional filters)
    app.get("/reviews", async (req, res) => {
      try {
        const query = {};
        const { email, scholarshipId } = req.query;

        if (email) {
          query.email = email;
        }

        if (scholarshipId) {
          query.scholarshipId = scholarshipId;
        }

        const cursor = reviewsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).send({ message: "Failed to fetch reviews" });
      }
    });

    // Create new review (Protected)
    app.post("/reviews", verifyFBToken, async (req, res) => {
      try {
        const reviewInfo = req.body;
        reviewInfo.createdAt = new Date();
        reviewInfo.email = req.decoded_email; // Ensure email matches token

        const result = await reviewsCollection.insertOne(reviewInfo);
        res.send(result);
      } catch (error) {
        console.error("Error creating review:", error);
        res.status(500).send({ message: "Failed to create review" });
      }
    });

    // Delete review (User can delete their own, Admin can delete any)
    app.delete("/reviews/:id", verifyFBToken, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid review ID" });
        }

        const review = await reviewsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!review) {
          return res.status(404).send({ message: "Review not found" });
        }

        // Check if user owns the review or is admin
        const user = await usersCollection.findOne({
          email: req.decoded_email,
        });

        if (review.email !== req.decoded_email && user.role !== "admin") {
          return res.status(403).send({ message: "forbidden access" });
        }

        const result = await reviewsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        console.error("Error deleting review:", error);
        res.status(500).send({ message: "Failed to delete review" });
      }
    });

    // ==================== User Related APIs ====================

    // Get user role
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        res.send({ role: user?.role || "student" });
      } catch (error) {
        console.error("Error fetching user role:", error);
        res.status(500).send({ message: "Failed to fetch user role" });
      }
    });

    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      const searchText = req.query.filter;
      const query = {};
      if (searchText) {
        // query.displayName = { $regex: searchText, $options: "i" };

        // we are using mongodb's $or operator for multi filed matching.
        query.$or = [
          { displayName: { $regex: searchText, $options: "i" } },
          { email: { $regex: searchText, $options: "i" } },
        ];
      }

      const cursor = usersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .limit(10);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get user profile (Protected)
    app.get("/users/profile", verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user);
      } catch (error) {
        console.error("Error fetching user profile:", error);
        res.status(500).send({ message: "Failed to fetch user profile" });
      }
    });

    // Create new user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        // Check if user already exists
        const email = user.email;
        const userExists = await usersCollection.findOne({ email });

        if (userExists) {
          return res.send({ message: "user exists", insertedId: null });
        }

        // Set default values
        user.role = user.role || "student";
        user.createdAt = new Date();

        const result = await usersCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).send({ message: "Failed to create user" });
      }
    });

    // Update user profile (Protected)
    app.patch("/users/profile", verifyFBToken, async (req, res) => {
      try {
        const email = req.decoded_email;
        const updateData = req.body;

        // Prevent role change through this endpoint
        delete updateData.role;
        delete updateData.email;

        const query = { email };
        const updatedDoc = {
          $set: {
            ...updateData,
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(query, updatedDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).send({ message: "Failed to update user profile" });
      }
    });

    // ==========Payment Related Apis============

    app.get("/application/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await scholarshipCollection.findOne(query);
      res.send(result);
    });

    app.post("/checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.applicationFees) * 100;

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: `Please Pay for: ${paymentInfo.scholarshipName}`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.studentEmail,
        mode: "payment",
        metadata: {
          scholarshipId: paymentInfo.scholarshipId,
        },
        success_url: `${YOUR_DOMAIN}/payment-success?successId={CHECKOUT_SESSION_ID}`,
        cancel_url: `${YOUR_DOMAIN}/payment-cancelled`,
      });

      console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.successId;
      // console.log("session Id", sessionId);

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // console.log("session retrieve", session);

      if (session.payment_status === "paid") {
        const id = session.metadata.scholarshipId;
        const query = { _id: new ObjectId(id) };

        const update = {
          $set: {
            paymentStatus: "paid",
            payAt: new Date(),
          },
        };

        const result = await scholarshipCollection.updateOne(query, update);
        res.send(result);
      }

      res.send({ success: false });
    });

    // Update user role (Admin only)
    app.patch(
      "/users/:email/role",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const email = req.params.email;
          const { role } = req.body;

          if (!["student", "admin", "moderator"].includes(role)) {
            return res.status(400).send({ message: "Invalid role" });
          }

          const query = { email };
          const updatedDoc = {
            $set: {
              role,
              updatedAt: new Date(),
            },
          };

          const result = await usersCollection.updateOne(query, updatedDoc);

          if (result.matchedCount === 0) {
            return res.status(404).send({ message: "User not found" });
          }

          res.send(result);
        } catch (error) {
          console.error("Error updating user role:", error);
          res.status(500).send({ message: "Failed to update user role" });
        }
      }
    );

    // ===========applications Related Apis========

    app.get("/applications", async (req, res) => {
      const query = {};
      const email = req.query.email;

      if (email) {
        query.userEmail = email;
      }

      const cursor = applicationsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/applications", async (req, res) => {
      const applicationInfo = req.body;
      applicationInfo.applicationDate = new Date();
      applicationInfo.paymentStatus = "unpaid";
      const applicationId = applicationInfo.scholarshipId;
      console.log(req.query);

      const { userEmail, scholarshipId } = applicationInfo;
      const query = {
        userEmail: userEmail,
        scholarshipId: scholarshipId,
      };

      const applicationExists = await applicationsCollection.findOne(query);

      if (applicationExists) {
        return res.send({ message: "application exists", insertedId: null });
      }

      const result = await applicationsCollection.insertOne(applicationInfo);
      res.send(result);
    });

    app.delete("/applications/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = {};

      const result = await applicationsCollection.deleteOne(query);
      res.send(result);
    });

    // Get all users (Admin only)
    app.get("/users", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const cursor = usersCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    console.log("✅ All routes initialized successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

// Root endpoint
app.get("/", (req, res) => {
  res.send({
    message: "Elevate Scholar Server is running",
    status: "active",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.send({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

// Run the database connection
run().catch(console.dir);
