const amqp = require('amqplib');
let channel, connection;

async function start() {
        try {
            connection = await amqp.connect('amqp://rabbitmq');
            channel = await connection.createChannel();
            console.log('Connected to RabbitMQ');
            await channel.assertQueue('task_queue');
            console.log('Queue created');
            channel.consume('task_queue', (msg) => {
                const taskData = JSON.parse(msg.content.toString());
                //here you can send the notification to the user by real implementation
                console.log(`Received message: ${taskData}`);
                console.log(`Task ID: ${taskData.taskId}`);
                console.log(`User ID: ${taskData.userId}`);
                console.log(`Title: ${taskData.title}`);
                channel.ack(msg);
            });
        } catch (error) {
            console.log(`Error connecting to RabbitMQ: ${error}`);
        }
}

start();