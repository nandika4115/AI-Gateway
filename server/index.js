require('dotenv').config();
console.log(process.env.MONGO_URI);
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimiter = require('./middleware/rateLimiter');
const gatewayRoutes = require('./routes/gateway');

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});
// Apply rate limiter to all gateway routes
app.use('/api', rateLimiter);
app.use('/api', gatewayRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(process.env.PORT || 5000, () => {
      console.log(`AI Gateway running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch(err => {
    console.error('DB connection failed:', err);
    process.exit(1);
  });
