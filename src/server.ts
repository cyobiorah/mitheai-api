import dotenv from "dotenv";
import "./worker/postWorker";
import "./worker/tiktok.direct.processor";

dotenv.config();

import app from "./app";
import { MongoDBConnection } from "./config/db";

const PORT = process.env.PORT ?? 3001;

MongoDBConnection.getInstance()
  .connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err: any) => {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  });
