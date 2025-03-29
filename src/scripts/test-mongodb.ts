import { getDb, getCollections } from '../config/mongodb';

async function testConnection() {
  try {
    console.log('Testing MongoDB connection...');
    const db = await getDb();
    console.log('Connected to database:', db.databaseName);
    
    // Test collections
    const collections = await getCollections();
    console.log('Available collections:', Object.keys(collections));
    
    // Close connection
    process.exit(0);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
}

testConnection();