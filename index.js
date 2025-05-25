const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const app = express();

app.use(express.json());

let db;
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) throw new Error('Firebase credentials not found');

  let serviceAccount = JSON.parse(serviceAccountJson);

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Service account JSON is missing required fields');
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  db = admin.firestore();
  console.log('Firebase initialized successfully');

} catch (error) {
  console.error('Error initializing Firebase:', error);
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

app.use((req, res, next) => {
  if (req.path !== '/telegram') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

app.post('/telegram', (req, res) => {
  res.sendStatus(200);

  (async () => {
    try {
      const msg = req.body?.message?.text;
      const sender = req.body?.message?.chat?.id;

      if (!sender || String(sender) !== String(CHAT_ID)) return;

      if (msg === '/emails') {
        const snapshot = await db.collection('users').get();
        const emails = snapshot.docs.map(d => d.data().email).filter(Boolean);
        const message = emails.length ? emails.join('\n').slice(0, 4000) : 'No emails found.';
        await sendMessage(message);
        return;
      }

      if (msg === '/unsubscribed') {
        const snapshot = await db.collection('users').where('isSubscribed', '==', false).get();
        const emails = snapshot.docs.map(d => d.data().email).filter(Boolean);
        const message = emails.length ? emails.join('\n').slice(0, 4000) : 'No unsubscribed users.';
        await sendMessage(message);
        return;
      }

      if (msg === '/status') {
        const message = db ? 'Firebase is connected and operational.' : 'Firebase is not properly initialized.';
        await sendMessage(message);
        return;
      }

      if (msg === '/newusers') {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const snapshot = await db.collection('users').where('trialStartDate', '>=', yesterday).get();
        const users = snapshot.docs.map(doc => {
          const d = doc.data();
          return `${d.firstName || ''} ${d.lastName || ''} - ${d.email}`;
        });
        const message = users.length ? `New users:\n${users.join('\n').slice(0, 4000)}` : 'No new users in the last 24h.';
        await sendMessage(message);
        return;
      }

      if (msg === '/expiredtrial') {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const snapshot = await db.collection('users')
          .where('isSubscribed', '==', false)
          .where('trialStartDate', '<=', threeDaysAgo)
          .get();
        const users = snapshot.docs.map(doc => {
          const d = doc.data();
          return `${d.firstName || ''} ${d.lastName || ''} - ${d.email}`;
        });
        const message = users.length ? `Expired trial:\n${users.join('\n').slice(0, 4000)}` : 'No users with expired trial.';
        await sendMessage(message);
        return;
      }

      await sendMessage(`Command not recognized: ${msg}. Available: /emails, /unsubscribed, /status, /newusers, /expiredtrial`);

    } catch (error) {
      console.error('Error in webhook handler:', error.message);
    }
  })();
});

async function sendMessage(text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHAT_ID,
      text,
    });
  } catch (error) {
    console.error('Error sending message to Telegram:', error.message);
  }
}

app.get('/health', (req, res) => {
  const status = {
    server: 'running',
    firebase: db ? 'connected' : 'not connected',
    timestamp: new Date().toISOString()
  };
  res.status(200).json(status);
});

app.get('/setup-webhook', async (req, res) => {
  try {
    const WEBHOOK_URL = req.query.url;
    if (!WEBHOOK_URL) return res.status(400).send('Provide ?url=');

    const response = await axios.post(`${TELEGRAM_API}/setWebhook`, {
      url: `${WEBHOOK_URL}/telegram`,
    });
    return res.send(`Webhook setup: ${JSON.stringify(response.data)}`);
  } catch (error) {
    return res.status(500).send(`Error setting webhook: ${error.message}`);
  }
});

app.get('/webhook-info', async (req, res) => {
  try {
    const response = await axios.get(`${TELEGRAM_API}/getWebhookInfo`);
    return res.send(response.data);
  } catch (error) {
    return res.status(500).send(`Error getting webhook info: ${error.message}`);
  }
});

// Poll new users every 30s and notify Telegram
let lastCheckTime = new Date();
setInterval(async () => {
  if (!db) return;
  try {
    const snapshot = await db.collection('users')
      .where('trialStartDate', '>=', lastCheckTime)
      .get();

    lastCheckTime = new Date();

    for (const doc of snapshot.docs) {
      const d = doc.data();
      const fullName = `${d.firstName || ''} ${d.lastName || ''}`.trim();
      const email = d.email || 'No email';
      await sendMessage(`👤 New user registered:\nName: ${fullName}\nEmail: ${email}`);
    }
  } catch (error) {
    console.error('Polling error:', error.message);
  }
}, 30000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
