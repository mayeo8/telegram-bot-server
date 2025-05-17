const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const app = express();

// Middleware
app.use(express.json());

// Initialize Firebase from env variables
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: process.env.FIREBASE_TYPE,
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
    }),
  });
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error.message);
  process.exit(1);
}

const db = admin.firestore();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Webhook endpoint for Telegram
app.post('/telegram', (req, res) => {
  // Respond quickly to prevent Telegram retries
  res.status(200).send('OK');

  // Proceed with handling in the background
  (async () => {
    try {
      console.log('Received webhook:', JSON.stringify(req.body));

      const msg = req.body?.message?.text;
      const sender = req.body?.message?.chat?.id;

      console.log(`Message: ${msg}, Sender: ${sender}`);

      if (!sender) {
        console.error('No sender ID found in request');
        await sendErrorMessage('No sender ID found in request');
        return;
      }

      if (String(sender) !== String(CHAT_ID)) {
        console.warn(`Unauthorized access attempt from ${sender}`);
        await sendErrorMessage(`Unauthorized access attempt from ${sender}`);
        return;
      }

      if (msg === '/emails') {
        console.log('Processing /emails command');
        try {
          const snapshot = await db.collection('users').get();
          const emails = snapshot.docs.map(d => d.data().email).filter(Boolean);
          const message = emails.length ? emails.join('\n').slice(0, 4000) : 'No emails found.';

          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
          });

          console.log('Email list sent successfully');
        } catch (error) {
          console.error('Error processing /emails command:', error.message);
          await sendErrorMessage(`Error getting emails: ${error.message}`);
        }
        return;
      }

      if (msg === '/unsubscribed') {
        console.log('Processing /unsubscribed command');
        try {
          const snapshot = await db.collection('users').where('isSubscribed', '==', false).get();
          const emails = snapshot.docs.map(d => d.data().email).filter(Boolean);
          const message = emails.length ? emails.join('\n').slice(0, 4000) : 'No unsubscribed users.';

          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
          });

          console.log('Unsubscribed list sent successfully');
        } catch (error) {
          console.error('Error processing /unsubscribed command:', error.message);
          await sendErrorMessage(`Error getting unsubscribed users: ${error.message}`);
        }
        return;
      }

      console.log('Command not recognized:', msg);
      await sendErrorMessage(`Command not recognized: ${msg}`);
    } catch (error) {
      console.error('Error in webhook handler:', error.message);
      await sendErrorMessage(`Unhandled error: ${error.message}`);
    }
  })();
});


// Helper function to send error messages to Telegram
async function sendErrorMessage(errorText) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHAT_ID,
      text: `Error: ${errorText}`,
    });
  } catch (error) {
    console.error('Error sending error message to Telegram:', error.message);
  }
}

// Route to check if server is running
app.get('/health', (req, res) => {
  res.status(200).send('Server is running');
});

// Set up webhook with Telegram
app.get('/setup-webhook', async (req, res) => {
  try {
    const WEBHOOK_URL = req.query.url;
    if (!WEBHOOK_URL) {
      return res.status(400).send('Please provide a webhook URL as a query parameter');
    }

    console.log(`Setting up webhook to: ${WEBHOOK_URL}/telegram`);
    const response = await axios.post(`${TELEGRAM_API}/setWebhook`, {
      url: `${WEBHOOK_URL}/telegram`,
    });

    console.log('Webhook setup response:', response.data);
    return res.send(`Webhook setup response: ${JSON.stringify(response.data)}`);
  } catch (error) {
    console.error('Error setting up webhook:', error.message);
    return res.status(500).send(`Error setting up webhook: ${error.message}`);
  }
});

// Get current webhook info
app.get('/webhook-info', async (req, res) => {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getWebhookInfo`);
    return res.send(response.data);
  } catch (error) {
    console.error('Error getting webhook info:', error.message);
    return res.status(500).send(`Error getting webhook info: ${error.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: https://your-render-url.onrender.com/telegram`);
  console.log(`Health check: https://your-render-url.onrender.com/health`);
  console.log(`Setup webhook: https://your-render-url.onrender.com/setup-webhook?url=https://your-render-url.onrender.com`);
});
