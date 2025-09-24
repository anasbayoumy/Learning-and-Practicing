const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const amqp = require('amqplib');
const { pool } = require('./db');
const pino = require('pino');

const logger = pino({ level: 'info' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.json());

// RabbitMQ connections - TWO separate connections
let connection_user;  // Connection to user's RabbitMQ
let connection_card;  // Connection to card's RabbitMQ
let channel_user;     // Channel for user's RabbitMQ
let channel_card;     // Channel for card's RabbitMQ

let userCreatedQueue = 'user_created_queue';
let cardGeneratedQueue = 'card_generated_queue';

// Initialize RabbitMQ connections
async function initRabbitMQ() {
  try {

    const userRabbitmqUrl = process.env.USER_RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq_user:5672';
    logger.info('Connecting to User RabbitMQ:', userRabbitmqUrl);
    connection_user = await amqp.connect(userRabbitmqUrl);
    channel_user = await connection_user.createChannel();
    
    // Connect to Card Service RabbitMQ (to publish card generation messages)
    const cardRabbitmqUrl = process.env.CARD_RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq_card:5672';
    logger.info('Connecting to Card RabbitMQ:', cardRabbitmqUrl);
    connection_card = await amqp.connect(cardRabbitmqUrl);
    channel_card = await connection_card.createChannel();

    await channel_user.assertQueue(userCreatedQueue, { durable: true });
    await channel_card.assertQueue(cardGeneratedQueue, { durable: true });

    await channel_user.consume(userCreatedQueue, async (msg) => {
      if (msg) {
        try {
          const userData = JSON.parse(msg.content.toString());
          logger.info('Received user data from user RabbitMQ:', userData);

          await processUserAndCreateCard(userData);
          
          channel_user.ack(msg);
        } catch (error) {
          logger.error('Error processing user data:', error);
          channel_user.nack(msg, false, false);
        }
      }
    });

    logger.info('Card Service connected to both RabbitMQ servers');
  } catch (error) {
    logger.error('Failed to connect to RabbitMQ:', error);
    process.exit(1);
  }
}

// Get all cards endpoint
app.get('/cards', async (req, res) => {
  try {
    const cards = await getAllCards();
    res.json(cards);
  } catch (error) {
    logger.error('Error fetching cards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get card by user ID endpoint
app.get('/cards/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const card = await getCardByUserId(userId);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json(card);
  } catch (error) {
    logger.error('Error fetching card:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'card_service',
    user_rabbitmq: connection_user ? 'connected' : 'disconnected',
    card_rabbitmq: connection_card ? 'connected' : 'disconnected'
  });
});

// Database functions
async function saveUserToCardDB(userData) {
  const query = `
    INSERT INTO users (id, name, phone, entry_date, expire_date)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    phone = VALUES(phone),
    entry_date = VALUES(entry_date),
    expire_date = VALUES(expire_date)
  `;
  
  await pool.execute(query, [
    userData.id,
    userData.name,
    userData.phone,
    userData.entry_date,
    userData.expire_date
  ]);
}

async function createCard(userId) {
  const cardId = uuidv4();
  const cardNumber = generateCardNumber();
  const pin = generatePIN();
  
  const cardData = {
    id: cardId,
    user_id: userId,
    some_related_data: {
      card_number: cardNumber,
      pin: pin,
      status: 'active',
      created_at: new Date().toISOString()
    }
  };

  const query = `
    INSERT INTO cards (id, user_id, some_related_data)
    VALUES (?, ?, ?)
  `;
  
  await pool.execute(query, [
    cardData.id,
    cardData.user_id,
    JSON.stringify(cardData.some_related_data)
  ]);

  return cardData;
}

async function getAllCards() {
  const query = `
    SELECT c.*, u.name as user_name, u.phone
    FROM cards c
    JOIN users u ON c.user_id = u.id
    ORDER BY c.created_at DESC
  `;
  
  const [rows] = await pool.execute(query);
  return rows;
}

async function getCardByUserId(userId) {
  const query = `
    SELECT c.*, u.name as user_name, u.phone
    FROM cards c
    JOIN users u ON c.user_id = u.id
    WHERE c.user_id = ?
  `;
  
  const [rows] = await pool.execute(query, [userId]);
  return rows[0];
}

// Utility functions
function generateCardNumber() {
  return Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString();
}

function generatePIN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Main processing function
async function processUserAndCreateCard(userData) {
  try {
    // Save user to card database
    await saveUserToCardDB(userData);
    logger.info('User saved to card database:', userData.id);

    // Create card for user
    const cardData = await createCard(userData.id);
    logger.info('Card created:', cardData.id);

    // Send card data back to user service (via card's RabbitMQ)
    await publishCardGenerated({
      user_id: userData.id,
      card: cardData.some_related_data
    });
    
    logger.info('Card data published to card RabbitMQ queue');
  } catch (error) {
    logger.error('Error processing user and creating card:', error);
    throw error;
  }
}

// RabbitMQ functions
async function publishCardGenerated(cardData) {
  if (!channel_card) {
    throw new Error('Card RabbitMQ channel not available');
  }
  
  const message = JSON.stringify(cardData);
  channel_card.sendToQueue(cardGeneratedQueue, Buffer.from(message), { persistent: true });
}

// Start server
async function startServer() {
  try {
    await initRabbitMQ();
    
    app.listen(PORT, () => {
      logger.info(`Card Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  if (connection_user) await connection_user.close();
  if (connection_card) await connection_card.close();
  process.exit(0);
});

startServer();