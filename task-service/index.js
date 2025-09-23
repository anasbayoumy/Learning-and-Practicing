const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const amqp = require('amqplib');
const app = express();
const port = 3001;

app.use(bodyParser.json());

mongoose.connect('mongodb://mongo:27017/tasks').then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.log(err);
});

const taskSchema = new mongoose.Schema({
    title: String,
    description: String,
    userId: String,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});
let channel, connection;
const Task = mongoose.model('Task', taskSchema);

async function connectToRabbitMQwithRetry(retries = 5, delay = 3000) {
    while(retries){
        try {
            connection = await amqp.connect('amqp://rabbitmq');
            channel = await connection.createChannel();
            console.log('Connected to RabbitMQ');
            await channel.assertQueue('task_queue');
            console.log('Queue created');
            return;
        } catch (error) {
            console.log(`Error connecting to RabbitMQ: ${error}`);
            retries--;
            console.log(`Failed to connect to RabbitMQ. Retries left: ${retries}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

app.post('/tasks', async (req, res) => {
const {title, description, userId} = req.body;
try {
    const task = new Task({title, description, userId});
    await task.save();
    const message = { taskId: task._id ,userId , title};
    if(!channel){return res.status(500).send('RabbitMQ connection not established');}
    await channel.sendToQueue('task_queue', Buffer.from(JSON.stringify(message)));
    console.log(`Message sent to RabbitMQ: ${message}`);
    res.status(201).send(task);
} catch (error) {
    res.status(500).send(error);
}
});

app.get('/tasks', async (req, res) => {
    try {
        const tasks = await Task.find();
        res.status(200).json(tasks);
    } catch (error) {
        res.status(500).send(error);
    }
});


app.listen(port, () => {
    console.log(`Task service is running on port ${port}`);
    connectToRabbitMQwithRetry();
});

app.get('/', (req, res) => {
    res.send('Task service is running');
});

