import mongoose from "mongoose";

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set in environment variables");
  await mongoose.connect(uri, {
    // options can be added here if needed
  });
  console.log("✅ Connected to MongoDB");
};