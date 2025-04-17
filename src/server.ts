import app from "./app";
import { connectDB } from "./config/db";

const PORT = process.env.PORT ?? 3001;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err: any) => {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  });
