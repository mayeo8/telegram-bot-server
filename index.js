const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const app = express();

// Middleware
app.use(express.json());

// Initialize Firebase using environment variables or service account file
let db;
// Add an alternative initialization method using a single JSON string
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.log('Found FIREBASE_SERVICE_ACCOUNT_JSON environment variable');
    
    try {
      // Parse the JSON string to an object
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      console.log('Successfully parsed service account JSON');
      
      // Initialize Firebase with the parsed service account
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      
      db = admin.firestore();
      console.log('Firebase initialized successfully with JSON string');
      
      // Test connection
      db.collection('users').limit(1).get()
        .then(snapshot => {
          console.log('✅ Firestore connection test successful using JSON string method!');
        })
        .catch(error => {
          console.error('❌ Firestore connection test failed with JSON string method:', error);
        });
    } catch (jsonError) {
      console.error('Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:', jsonError);
    }
  }
  // Fall back to previous methods if JSON string not available
  else if (process.env.FIREBASE_PROJECT_ID && 
      process.env.FIREBASE_PRIVATE_KEY && 
      process.env.FIREBASE_CLIENT_EMAIL) {
    
    console.log('Using Firebase credentials from environment variables');
    
    // Log the first few characters of the private key to check format (without exposing full key)
    const privateKeyPreview = process.env.FIREBASE_PRIVATE_KEY.substring(0, 50) + '...';
    console.log(`Private key format check: ${privateKeyPreview}`);
    
    // Check if the private key has proper BEGIN/END markers
    if (!process.env.FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY') || 
        !process.env.FIREBASE_PRIVATE_KEY.includes('END PRIVATE KEY')) {
      console.warn('WARNING: Private key may be missing BEGIN/END markers');
    }
    
    // Fix private key formatting - replace escaped newlines with actual newlines
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    
    // Replace various possible newline formats
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Remove any quotes that might have been added
    if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || 
        (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
      console.log('Removed surrounding quotes from private key');
    }
    
    console.log('Project ID:', process.env.FIREBASE_PROJECT_ID);
    console.log('Client Email:', process.env.FIREBASE_CLIENT_EMAIL);
    console.log('Private Key (first 20 chars):', privateKey.substring(0, 20) + '...');
    
    try {
      // Create a full service account object in the correct format
      const serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || 'private-key-id',
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID || '',
        auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
        token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL || `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
      };
      
      console.log('Service account object created successfully');
      
      // Initialize Firebase
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      
      db = admin.firestore();
      console.log('Firebase initialized successfully using environment variables');
      
      // Test Firestore connection immediately to verify it works
      console.log('Testing Firestore connection...');
      db.collection('users').limit(1).get()
        .then(snapshot => {
          console.log('✅ Firestore connection test successful!');
          console.log(`Found ${snapshot.size} documents in users collection`);
        })
        .catch(error => {
          console.error('❌ Firestore connection test failed:', error);
        });
      
    } catch (certError) {
      console.error('Error creating credential with environment variables:', certError);
      throw new Error(`Failed to create credential: ${certError.message}`);
    }
  } 
  // If environment variables not available, try to use service account file
  else {
    try {
      console.log('Trying to load service account key from file...');
      const serviceAccount = require('./serviceAccountKey.json');
      console.log('Service account key file loaded successfully');
      
      if (serviceAccount.project_id) {
        console.log(`Firebase project ID: ${serviceAccount.project_id}`);
      }
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      
      db = admin.firestore();
      console.log('Firebase initialized successfully using service account file');
    } catch (fileError) {
      console.error('Error loading service account key file:', fileError.message);
      throw new Error(`Service account key error: ${fileError.message}`);
    }
  }
} catch (error) {
  console.error('Error initializing Firebase:', error);
  // Continue running the server for other endpoints
  console.warn('Running with limited functionality - Firebase features disabled');
}
const BOT_TOKEN = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const CHAT_ID = 'xxxxxxxxxxxxxxxxx';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Debug endpoint that logs all request details
app.all('/debug', (req, res) => {
  console.log('DEBUG ENDPOINT CALLED');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers));
  console.log('Body:', JSON.stringify(req.body));
  console.log('Query:', JSON.stringify(req.query));
  res.send('Debug info logged');
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
      console.warn(`Unauthorized access attempt. Received sender: ${sender}, Expected CHAT_ID: ${CHAT_ID}`);
      // For testing purposes, continue processing anyway
      // return res.status(401).send('Unauthorized');
    }
    
    // Handle commands
    const command = msg?.toLowerCase().trim();
    
    // Handle /emails or /email command
    if (command === '/emails' || command === '/email') {
      console.log('Processing emails command');
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
        console.error('Error processing emails command:', error.message);
        await sendErrorMessage(`Error getting emails: ${error.message}`);
        return res.status(500).send('Internal server error');
      }
    }
    
    // Handle /unsubscribed command
    if (command === '/unsubscribed') {
      console.log('Processing unsubscribed command');
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
        console.error('Error processing unsubscribed command:', error.message);
        await sendErrorMessage(`Error getting unsubscribed users: ${error.message}`);
        return res.status(500).send('Internal server error');
      }
    }
    
    // Add command to display available commands
    if (command === '/help' || command === '/start') {
      console.log('Processing help/start command');
      try {
        const helpMessage = 
          "Available commands:\n" +
          "/email or /emails - Get a list of all user emails\n" +
          "/unsubscribed - Get a list of unsubscribed user emails\n" +
          "/help - Show this help message";
        
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: CHAT_ID,
          text: helpMessage,
        });
        
        console.log('Help message sent successfully');
        return res.send('Help command processed successfully');
      } catch (error) {
        console.error('Error sending help message:', error.message);
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

// Add a direct environment variable inspection endpoint to help debug
// Update debug-env endpoint to check for the JSON string option
app.get('/debug-env', (req, res) => {
  // Only check if variables exist and show first few characters for security
  const envDebug = {
    firebase_service_account_json_exists: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    firebase_service_account_json_preview: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? 
      'JSON string of length: ' + process.env.FIREBASE_SERVICE_ACCOUNT_JSON.length : 'not set',
    firebase_project_id_exists: !!process.env.FIREBASE_PROJECT_ID,
    firebase_private_key_exists: !!process.env.FIREBASE_PRIVATE_KEY,
    firebase_client_email_exists: !!process.env.FIREBASE_CLIENT_EMAIL,
    firebase_project_id_preview: process.env.FIREBASE_PROJECT_ID ? 
      process.env.FIREBASE_PROJECT_ID.substring(0, 5) + '...' : 'not set',
    firebase_private_key_format: process.env.FIREBASE_PRIVATE_KEY ? 
      (process.env.FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY') ? 'looks valid' : 'missing markers') : 'not set',
    firebase_client_email_preview: process.env.FIREBASE_CLIENT_EMAIL ? 
      process.env.FIREBASE_CLIENT_EMAIL.split('@')[0] + '@...' : 'not set',
    port: process.env.PORT || 'default'
  };
  
  res.json(envDebug);
});

// Test Firestore connection with detailed error logging
app.get('/test-firebase', async (req, res) => {
  try {
    if (!db) {
      throw new Error('Firebase not initialized');
    }
    
    console.log('Testing firebase connection...');
    
    try {
      const snapshot = await db.collection('users').limit(1).get();
      console.log('Firestore query executed successfully');
      
      // Send back result
      res.json({
        success: true,
        count: snapshot.size,
        sample: snapshot.empty ? null : {
          data: snapshot.docs[0].data(),
          id: snapshot.docs[0].id
        },
        message: 'Firestore connection working properly'
      });
    } catch (firestoreError) {
      console.error('Firestore query error details:', firestoreError);
      
      // Send detailed error
      res.status(500).json({
        success: false,
        error: {
          message: firestoreError.message,
          code: firestoreError.code,
          details: firestoreError.details || 'No additional details',
          stack: process.env.NODE_ENV === 'development' ? firestoreError.stack : undefined
        }
      });
    }
  } catch (error) {
    console.error('Firebase test general error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Echo endpoint to help debug Telegram messages
app.post('/echo', express.json(), (req, res) => {
  console.log('ECHO ENDPOINT CALLED');
  console.log('Request body:', JSON.stringify(req.body));
  
  // Send the request body back as the response
  res.json({
    message: 'Echo endpoint received your request',
    receivedBody: req.body
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Webhook endpoint: https://your-domain.com/telegram`);
  console.log(`Health check: https://your-domain.com/health`);
  console.log(`Setup webhook: https://your-domain.com/setup-webhook?url=https://your-domain.com`);
});
