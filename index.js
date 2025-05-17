const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const app = express();

// Middleware
app.use(express.json());

// Improved Firebase initialization with better error handling
let db;
try {
  // Check if we have the environment variable 
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  if (!serviceAccountJson) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set');
    throw new Error('Firebase credentials not found');
  }
  
  // Try to parse the JSON
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
    
    // Validate the service account has the required fields
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('Service account JSON is missing required fields');
    }
    
    console.log('Service account email:', serviceAccount.client_email);
    console.log('Project ID:', serviceAccount.project_id);
    
    // Check if the private key is correctly formatted
    if (!serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
      console.warn('Private key may be malformatted - check if newlines are preserved');
    }
    
  } catch (parseError) {
    console.error('Failed to parse service account JSON:', parseError);
    throw new Error('Invalid service account JSON format');
  }
  
  // Initialize Firebase with the parsed credentials
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  // Initialize Firestore
  db = admin.firestore();
  console.log('Firebase initialized successfully');
  
} catch (error) {
  console.error('Error initializing Firebase:', error);
  // Continue execution but expect Firestore operations to fail
}

const BOT_TOKEN = process.env.BOT_TOKEN || '8022649727:AAF68rSMpakClEdGc-QSonTuu33t4TijhlE';
const CHAT_ID = process.env.CHAT_ID || '5298733898';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Webhook endpoint for Telegram
app.post('/telegram', (req, res) => {
  // Immediately respond 200 to Telegram to stop retries
  res.sendStatus(200);

  // Then process the message asynchronously without blocking Telegram
  (async () => {
    try {
      console.log('Received webhook:', JSON.stringify(req.body));

      const msg = req.body?.message?.text;
      const sender = req.body?.message?.chat?.id;

      console.log(`Message: ${msg}, Sender: ${sender}`);

      if (!sender) {
        console.error('No sender ID found in request');
        return;
      }

      if (String(sender) !== String(CHAT_ID)) {
        console.warn(`Unauthorized access attempt from ${sender}`);
        return;
      }

      if (msg === '/emails') {
        console.log('Processing /emails command');
        try {
          // Check if db is initialized
          if (!db) {
            throw new Error('Firebase not initialized properly');
          }
          
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
          // Check if db is initialized
          if (!db) {
            throw new Error('Firebase not initialized properly');
          }
          
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

      if (msg === '/status') {
        console.log('Processing /status command');
        try {
          const message = db ? 'Firebase is connected and operational.' : 'Firebase is not properly initialized.';
          
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
          });
          
          console.log('Status message sent successfully');
        } catch (error) {
          console.error('Error sending status message:', error.message);
          await sendErrorMessage(`Error checking status: ${error.message}`);
        }
        return;
      }

      console.log('Command not recognized:', msg);
      await sendErrorMessage(`Command not recognized: ${msg}. Available commands: /emails, /unsubscribed, /status`);

    } catch (error) {
      console.error('Error in webhook handler:', error.message);
      // Do not throw or respond with error status here
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
  const status = {
    server: 'running',
    firebase: db ? 'connected' : 'not connected',
    timestamp: new Date().toISOString()
  };
  res.status(200).json(status);
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
  console.log(`Webhook endpoint: https://telegram-bot-server-spvo.onrender.com/telegram`);
  console.log(`Health check: https://telegram-bot-server-spvo.onrender.com/health`);
  console.log(`Setup webhook: https://telegram-bot-server-spvo.onrender.com/setup-webhook?url=https://telegram-bot-server-spvo.onrender.com`);
});
