const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const amqp = require('amqplib');
const { pool } = require('./db');
const pino = require('pino');

const logger = pino({ level: 'info' });
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// RabbitMQ connections - TWO separate connections
let connection_user;  // Connection to user's RabbitMQ
let connection_card;  // Connection to card's RabbitMQ
let channel_user;     // Channel for user's RabbitMQ
let channel_card;     // Channel for card's RabbitMQ

let userCreatedQueue = 'user_created_queue';
let cardGeneratedQueue = 'card_generated_queue';

// Helper function to format datetime for MySQL
function formatDateTimeForMySQL(dateString) {
  if (!dateString) return null;
  
  // If it's already in the correct format, return as is
  if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
    return dateString;
  }
  
  // Convert ISO string to MySQL format
  const date = new Date(dateString);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'user_service',
    user_rabbitmq: connection_user ? 'connected' : 'disconnected',
    card_rabbitmq: connection_card ? 'connected' : 'disconnected'
  });
});

// Database test endpoint
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT 1 as test');
    res.json({ 
      status: 'Database connected', 
      test: rows[0] 
    });
  } catch (error) {
    logger.error('Database test error:', error.message);
    res.status(500).json({ 
      error: 'Database connection failed', 
      details: error.message 
    });
  }
});

app.post('/users', async (req, res) => {
    try {
        const { name, phone, entry_date, expire_date } = req.body;
    
        if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }

    const userId = uuidv4();
    const userData = {
        id: userId,
        name,
        phone,
        entry_date: formatDateTimeForMySQL(entry_date) || formatDateTimeForMySQL(new Date().toISOString()),
        expire_date: formatDateTimeForMySQL(expire_date) || formatDateTimeForMySQL(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()) // 1 year from now
    };

      // Save user to database
    await saveUser(userData);
    logger.info('User created:', userData);

      // Send message to RabbitMQ queue
    await publishUserCreated(userData);
    logger.info('User data published to user RabbitMQ queue');

    res.status(201).json({
        message: 'User created successfully',
        user: userData
    });

    } catch (error) {
    logger.error('Error creating user:', error.message);
    logger.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});
    
app.get('/users', async (req, res) => {
    try {
      const users = await getAllUsers();
      res.json(users);
    } catch (error) {
      logger.error('Error fetching users:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

app.get('/users/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const user = await getUserById(id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      res.json(user);
    } catch (error) {
      logger.error('Error fetching user:', error.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
    

// <><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><>Database functions<><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><>
async function saveUser(userData) {
    const query = `
      INSERT INTO users (id, name, phone, entry_date, expire_date)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    await pool.execute(query, [
      userData.id,
      userData.name,
      userData.phone,
      userData.entry_date,
      userData.expire_date
    ]);
  }
  
  async function getUserById(id) {
    const query = `
      SELECT u.*, uc.card_data
      FROM users u
      LEFT JOIN user_cards uc ON u.id = uc.user_id
      WHERE u.id = ?
    `;
    
    const [rows] = await pool.execute(query, [id]);
    return rows[0];
  }
  
  async function getAllUsers() {
    const query = `
      SELECT u.*, uc.card_data
      FROM users u
      LEFT JOIN user_cards uc ON u.id = uc.user_id
      ORDER BY u.entry_date DESC
    `;
    
    const [rows] = await pool.execute(query);
    return rows;
  }
  
  async function updateUserWithCard(cardData) {
    const query = `
      INSERT INTO user_cards (id, user_id, card_data)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE card_data = VALUES(card_data)
    `;
    
    await pool.execute(query, [
      uuidv4(),
      cardData.user_id,
      JSON.stringify(cardData.card)
    ]);
    
    logger.info('User updated with card data:', cardData.user_id);
  }
  

// <><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><>RabbitMQ functions<><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><><>
async function connectToRabbitMQ() {
    try {
        // Connect to User's own RabbitMQ (to publish user creation messages)
        const userRabbitmqUrl = process.env.USER_RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq_user:5672';
        logger.info('Connecting to User RabbitMQ:', userRabbitmqUrl);
        connection_user = await amqp.connect(userRabbitmqUrl);
        channel_user = await connection_user.createChannel();
        
        // Connect to Card's RabbitMQ (to consume card generation messages)
        const cardRabbitmqUrl = process.env.CARD_RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq_card:5672';
        logger.info('Connecting to Card RabbitMQ:', cardRabbitmqUrl);
        connection_card = await amqp.connect(cardRabbitmqUrl);
        channel_card = await connection_card.createChannel();
        
        // Declare queues on both servers
        await channel_user.assertQueue(userCreatedQueue, { durable: true });
        await channel_card.assertQueue(cardGeneratedQueue, { durable: true });
        
        // Set up consumer for card_generated_queue (from card's RabbitMQ)
        await channel_card.consume(cardGeneratedQueue, async (msg) => {
            if (msg) {
                try {
                    const cardData = JSON.parse(msg.content.toString());
                    logger.info('Received card data from card RabbitMQ:', cardData);
                    
                    // Update user with card information
                    await updateUserWithCard(cardData);
                    
                    channel_card.ack(msg);
                } catch (error) {
                    logger.error('Error processing card data:', error);
                    channel_card.nack(msg, false, false);
                }
            }
        });
        
        logger.info('Connected to both RabbitMQ servers and set up consumers');
    } catch (error) {
        logger.error('Failed to connect to RabbitMQ:', error.message);
        logger.error('RabbitMQ connection error stack:', error.stack);
        throw error;
    }
}

async function publishUserCreated(userData) {
    if (!channel_user) {
        throw new Error('User RabbitMQ channel not available');
    }
    await channel_user.sendToQueue(userCreatedQueue, Buffer.from(JSON.stringify(userData)), { persistent: true });
}

// Start server
async function startServer() {
    try {
    await connectToRabbitMQ();
      
      app.listen(PORT, () => {
        logger.info(`User Service running on port ${PORT}`);
        logger.info(`Connected to both RabbitMQ servers`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error.message);
      logger.error('Start server error stack:', error.stack);
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