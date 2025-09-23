const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

app.use(bodyParser.json());

mongoose.connect('mongodb://mongo:27017/users').then(() => {
    console.log('Connected to MongoDB');
}).catch((err) => {
    console.log(err);
});

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    // password: String
});

const User = mongoose.model('User', userSchema);

app.post('/users', async (req, res) => {
const {name, email} = req.body;
try {
    const user = new User({name, email});
    await user.save();
    res.status(201).send(user);
} catch (error) {
    res.status(500).send(error);
}
});

app.get('/users', async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).send(users).json(users);
    } catch (error) {
        res.status(500).send(error);
    }
});


app.listen(port, () => {
    console.log(`User service is running on port ${port}`);
});

app.get('/', (req, res) => {
    res.send('User service is running');
});

