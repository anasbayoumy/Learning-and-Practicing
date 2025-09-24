# Asynchronous User Data Processing System

A robust microservices architecture implementing asynchronous communication between User Service and Card Service using dual RabbitMQ servers for complete service isolation and independence.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER SERVICE STACK                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   User Service  │  │   RabbitMQ      │  │   User DB       │  │
│  │   (Port 3000)   │  │   (Port 5672)   │  │   (Port 3306)   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ Cross-RabbitMQ Communication
                                │
┌─────────────────────────────────────────────────────────────────┐
│                        CARD SERVICE STACK                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Card Service  │  │   RabbitMQ      │  │   Card DB       │  │
│  │   (Port 3001)   │  │   (Port 5673)   │  │   (Port 3307)   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Message Flow

1. **User Creation**: Client → User Service → User Database
2. **Message Publishing**: User Service → User RabbitMQ (`user_created_queue`)
3. **Message Consumption**: Card Service ← User RabbitMQ
4. **Card Processing**: Card Service → Card Database
5. **Card Generation**: Card Service creates unique card with number and PIN
6. **Response Publishing**: Card Service → Card RabbitMQ (`card_generated_queue`)
7. **Response Consumption**: User Service ← Card RabbitMQ
8. **User Update**: User Service updates user record with card data

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)

### 1. Clone and Setup

```bash
git clone <repository-url>
cd user-card-queue
```

### 2. Start All Services

```bash
docker-compose up --build -d
```

### 3. Verify Services

```bash
# Check User Service health
curl http://localhost:3000/health

# Check Card Service health
curl http://localhost:3001/health

# Test database connectivity
curl http://localhost:3000/test-db
```

### 4. Create Your First User

```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "phone": "+1234567890",
    "entry_date": "2024-01-01T00:00:00Z",
    "expire_date": "2025-01-01T00:00:00Z"
  }'
```

### 5. Check Results

```bash
# Get all users with card data
curl http://localhost:3000/users

# Get all cards
curl http://localhost:3001/cards

# Get specific user (replace {user_id})
curl http://localhost:3000/users/{user_id}

# Get card by user ID
curl http://localhost:3001/cards/user/{user_id}
```

## 📋 Services

### User Service (Port 3000)
- **Purpose**: Manages user data and initiates card creation process
- **Database**: MySQL on port 3306 (`users_db`)
- **RabbitMQ**: Own server on port 5672
- **Responsibilities**:
  - Create users via REST API
  - Store user data in local database
  - Publish user creation events to own RabbitMQ
  - Consume card generation events from Card RabbitMQ
  - Update user records with card information

### Card Service (Port 3001)
- **Purpose**: Processes user data and generates cards
- **Database**: MySQL on port 3307 (`cards_db`)
- **RabbitMQ**: Own server on port 5673
- **Responsibilities**:
  - Consume user creation events from User RabbitMQ
  - Store user data in local database
  - Generate cards with unique numbers and PINs
  - Publish card generation events to own RabbitMQ

## 🔧 API Endpoints

### User Service (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |
| `GET` | `/test-db` | Database connectivity test |
| `POST` | `/users` | Create a new user |
| `GET` | `/users` | Get all users with card data |
| `GET` | `/users/:id` | Get specific user with card data |

### Card Service (Port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |
| `GET` | `/cards` | Get all cards with user information |
| `GET` | `/cards/user/:userId` | Get card by user ID |

## 📊 Database Schemas

### User Database (`users_db`)

```sql
-- Users table
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  entry_date DATETIME,
  expire_date DATETIME
);

-- User cards table (stores card data from Card Service)
CREATE TABLE user_cards (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36),
  card_data JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Card Database (`cards_db`)

```sql
-- Users table (copied from users_db)
CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  entry_date DATETIME,
  expire_date DATETIME
);

-- Cards table
CREATE TABLE cards (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36),
  some_related_data JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## 🐰 RabbitMQ Configuration

### User RabbitMQ (Port 5672)
- **Management UI**: http://localhost:15672
- **Credentials**: admin/admin123
- **Queues**:
  - `user_created_queue`: User Service → Card Service
  - `card_generated_queue`: Card Service → User Service

### Card RabbitMQ (Port 5673)
- **Management UI**: http://localhost:15673
- **Credentials**: admin/admin123
- **Queues**:
  - `user_created_queue`: User Service → Card Service
  - `card_generated_queue`: Card Service → User Service

## 🧪 Testing

### Health Checks

```bash
# User Service
curl http://localhost:3000/health

# Card Service
curl http://localhost:3001/health
```

### User Creation Tests

```bash
# Create user with full data
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alice Johnson",
    "phone": "+1987654321",
    "entry_date": "2024-01-15T10:30:00Z",
    "expire_date": "2025-01-15T10:30:00Z"
  }'

# Create user with minimal data
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Jane Smith"}'
```

### Error Testing

```bash
# Test missing required field
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890"}'

# Test non-existent user
curl http://localhost:3000/users/non-existent-id
```

## 📈 Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f user_service
docker-compose logs -f card_service
```

### RabbitMQ Management

- **User RabbitMQ**: http://localhost:15672
- **Card RabbitMQ**: http://localhost:15673

Monitor queues, connections, and message flow in real-time.

## 🏗️ Development

### Local Development

```bash
# Install dependencies
cd user_service && npm install
cd ../card_service && npm install

# Run services locally (requires RabbitMQ and MySQL running)
cd user_service && npm run dev
cd card_service && npm run dev
```

### Environment Variables

#### User Service
- `MYSQL_HOST`: Database host (default: mysql_user)
- `MYSQL_PORT`: Database port (default: 3306)
- `MYSQL_USER`: Database user (default: root)
- `MYSQL_PASS`: Database password (default: rootpass)
- `MYSQL_DB`: Database name (default: users_db)
- `USER_RABBITMQ_URL`: User RabbitMQ connection string
- `CARD_RABBITMQ_URL`: Card RabbitMQ connection string
- `PORT`: Service port (default: 3000)

#### Card Service
- `MYSQL_HOST`: Database host (default: mysql_card)
- `MYSQL_PORT`: Database port (default: 3306)
- `MYSQL_USER`: Database user (default: root)
- `MYSQL_PASS`: Database password (default: rootpass)
- `MYSQL_DB`: Database name (default: cards_db)
- `USER_RABBITMQ_URL`: User RabbitMQ connection string
- `CARD_RABBITMQ_URL`: Card RabbitMQ connection string
- `PORT`: Service port (default: 3001)

## 🎯 Benefits

### Decoupling
- Services operate independently
- No direct service-to-service dependencies
- Each service can be developed, deployed, and scaled independently

### Scalability
- Each service can be scaled horizontally
- RabbitMQ queues handle load balancing
- Database connections are isolated per service

### Resilience
- Service failures don't cascade
- Messages are persisted in queues
- Automatic retry mechanisms
- Graceful degradation

### Maintainability
- Clear separation of concerns
- Independent technology stacks
- Easier debugging and monitoring
- Simplified testing

## 🔧 Troubleshooting

### Common Issues

1. **Services not connecting to RabbitMQ**
   ```bash
   # Check RabbitMQ logs
   docker-compose logs rabbitmq_user
   docker-compose logs rabbitmq_card
   ```

2. **Database connection issues**
   ```bash
   # Test database connectivity
   curl http://localhost:3000/test-db
   ```

3. **Messages not being processed**
   ```bash
   # Check service logs
   docker-compose logs -f user_service
   docker-compose logs -f card_service
   
   # Check RabbitMQ management UI
   # http://localhost:15672 and http://localhost:15673
   ```

### Reset Everything

```bash
# Stop and remove all containers, networks, and volumes
docker-compose down -v

# Rebuild and start fresh
docker-compose up --build -d
```

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs
3. Check RabbitMQ management UIs
4. Create an issue in the repository
