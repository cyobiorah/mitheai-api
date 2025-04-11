import app from "./app";
import dotenv from "dotenv";
import { MongoDBConnection } from "./config/mongodb";

dotenv.config();

const port = process.env.PORT ?? 3001;

if (process.env.NODE_ENV === "development") {
  try {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
} else {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

let lastActivityTime = Date.now();

app.use((req, res, next) => {
  lastActivityTime = Date.now();
  next();
});

// Keep-alive ping every 5 minutes
setInterval(async () => {
  const idleTime = Date.now() - lastActivityTime;
  const fiveMinutes = 5 * 60 * 1000;

  if (idleTime >= fiveMinutes) {
    await MongoDBConnection.getInstance().ping();
  }
}, 5 * 60 * 1000);
