const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const app = express();

// Middleware
app.use(express.json());

// Initialize Firebase using FIREBASE_SERVICE_ACCOUNT_JSON
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase:', error.message);
  process.exit(1);
}

const db = admin.firestore();
const BOT_TOKEN = '8022649727:AAF68rSMpakClEdGc-QSonTuu33t4TijhlE';
const CHAT_ID = '5298733898';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Webhook endpoint for Telegram
app.post('/telegram', async (req, res) => {
  try {
    console.log('Received webhook:', JSON.stringify(req.body));

    const msg = req.body?.message?.text;
    const sender = req.body?.message?.chat?.id;

    console.log(`Message: ${msg}, Sender: ${sender}`);

    if (!sender) {
      console.error('No sender ID found in request');
      return res.status(400).send('Bad request: No sender ID');
    }

    if (String(sender) !== String(CHAT_ID)) {
      console.warn(`Unauthorized access attempt from ${sender}`);
      return res.status(401).send('Unauthorized');
    }

    // Handle /emails command
    if (msg === '/emails') {
      console.log('Processing /emails command');
      try {
        const snapshot = await db.collection('users').get();
        const emails = snapshot.docs.map(d => d.data().email).filter(Boolean);

        console.log(`Found ${emails.length} emails`);
        const message = emails.length ? emails.join('\n').slice(0, 4000) : 'No emails found.';

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: CHAT_ID,
          text: message,
        });

        console.log('Email list sent successfully');
        return res.send('Emails command processed successfully');
      } catch (error) {
        console.error('Error processing /emails command:', error.message);
        await sendErrorMessage(`Error getting emails: ${error.message}`);
        return res.status(500).send('Internal server error');
      }
    }

    // Handle /unsubscribed command
    if (msg === '/unsubscribed') {
      console.log('Processing /unsubscribed command');
      try {
        const snapshot = await db.collection('users').where('isSubscribed', '==', false).get();
        const emails = snapshot.docs.map(d => d.data().email).filter(Boolean);

        console.log(`Found ${emails.length} unsubscribed emails`);
        const message = emails.length ? emails.join('\n').slice(0, 4000) : 'No unsubscribed users.';

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: CHAT_ID,
          text: message,
        });

        console.log('Unsubscribed list sent successfully');
        return res.send('Unsubscribed command processed successfully');
      } catch (error) {
        console.error('Error processing /unsubscribed command:', error.message);
        await sendErrorMessage(`Error getting unsubscribed users: ${error.message}`);
        return res.status(500).send('Internal server error');
      }
    }

    console.log('Command not recognized:', msg);
    await sendErrorMessage(`Command not recognized: ${msg}`);
    return res.send('Command not recognized');

  } catch (error) {
    console.error('Error in webhook handler:', error.message);
    return res.status(500).send('Internal server error');
  }
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
  console.log(`Webhook endpoint: https://telegram-bot-server-spvo.onrender.com`);
  console.log(`Health check: https://telegram-bot-server-spvo.onrender.com/health`);
  console.log(`Setup webhook: https://telegram-bot-server-spvo.onrender.com/setup-webhook?url=https://telegram-bot-server-spvo.onrender.com`);
});
