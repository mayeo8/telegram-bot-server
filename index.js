const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const app = express();
app.use(express.json());

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN'; // Replace with your token
const CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID';     // Replace with your Telegram chat ID
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// /telegram endpoint for webhook
app.post('/telegram', async (req, res) => {
  const msg = req.body?.message?.text;
  const sender = req.body?.message?.chat?.id;

  if (String(sender) !== String(CHAT_ID)) return res.send('Unauthorized');

  if (msg === '/emails') {
    const snapshot = await db.collection('users').get();
    const emails = snapshot.docs.map(d => d.data().email).filter(Boolean);
    const message = emails.length ? emails.join('\n').slice(0, 4000) : 'No emails found.';

    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
    });
    return res.send('Done');
  }

  if (msg === '/unsubscribed') {
    const snapshot = await db.collection('users').where('isSubscribed', '==', false).get();
    const emails = snapshot.docs.map(d => d.data().email).filter(Boolean);
    const message = emails.length ? emails.join('\n').slice(0, 4000) : 'No unsubscribed users.';

    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
    });
    return res.send('Done');
  }

  return res.send('Command not recognized');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
