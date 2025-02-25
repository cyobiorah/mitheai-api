// import express from 'express';
// import cors from 'cors';
// import helmet from 'helmet';
// import compression from 'compression';
// import morgan from 'morgan';
// import { config } from 'dotenv';
// import usersRouter from './routes/users.routes';
// import teamsRouter from './routes/teams.routes';
// import invitationRoutes from './routes/index';
// import { authenticateToken } from './middleware/auth.middleware';

// // Load environment variables
// config();

// const app = express();
// const port = process.env.PORT || 3001;

// // Middleware
// app.use(cors());
// app.use(helmet());
// app.use(compression());
// app.use(morgan('dev'));
// app.use(express.json());

// // Mount test routes first (only in development)
// // if (process.env.NODE_ENV === 'development') {
// //   app.use('/api', testRouter);
// // }

// // Routes
// app.use('/api', invitationRoutes);  // Mount invitation routes first (includes test route)
// app.use('/api/users', authenticateToken, usersRouter);  // Protected routes
// app.use('/api/teams', authenticateToken, teamsRouter);  // Protected routes

// // Health check endpoint
// app.get('/health', (req, res) => {
//   res.json({ status: 'ok', timestamp: new Date().toISOString() });
// });

// // Error handling middleware
// app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
//   console.error(err.stack);
//   res.status(500).json({
//     error: 'Internal Server Error',
//     message: process.env.NODE_ENV === 'development' ? err.message : undefined
//   });
// });

// // Print out all registered routes
// console.log('\nRegistered Routes:');
// app._router.stack.forEach((middleware: any) => {
//   if (middleware.route) {
//     console.log('Route:', middleware.route.path);
//     console.log('Methods:', Object.keys(middleware.route.methods));
//   } else if (middleware.name === 'router') {
//     console.log('Router:', middleware.regexp);
//     middleware.handle.stack.forEach((handler: any) => {
//       if (handler.route) {
//         console.log('  Path:', handler.route.path);
//         console.log('  Methods:', Object.keys(handler.route.methods));
//       }
//     });
//   }
// });

// // Start server
// app.listen(port, () => {
//   console.log(`\nServer running on port ${port}`);
// });

// process.on('uncaughtException', (error) => {
//   console.error('Uncaught Exception:', error);
// });

// process.on('unhandledRejection', (reason, promise) => {
//   console.error('Unhandled Rejection at:', promise, 'reason:', reason);
// });

import app from "./app";
import session from "express-session";
import passport from "./config/passport.config";

app.use(
  session({
    secret: process.env.TWITTER_CONSUMER_SECRET!,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// The app is now configured and started in app.ts
// This file just imports and re-exports the app for compatibility
export default app;
