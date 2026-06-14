require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

const DB_DIR = path.join(__dirname, 'data');
const TASKS_FILE = path.join(DB_DIR, 'tasks.json');
const USERS_FILE = path.join(DB_DIR, 'users.json');

// Ensure Local DB directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Mongoose Configuration
mongoose.set('bufferCommands', false);

let isMongoConnected = false;

// Mongoose Schemas (Only compiled if MongoDB is used, but defined globally)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  dueDate: { type: String, default: '' },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  customOrder: { type: Number, default: 0 }
});

let User;
let Task;

try {
  User = mongoose.model('User', userSchema);
  Task = mongoose.model('Task', taskSchema);
} catch (e) {
  User = mongoose.model('User');
  Task = mongoose.model('Task');
}

// Connect to MongoDB Atlas with a timeout fallback
async function connectDB() {
  console.log('Connecting to MongoDB Atlas...');
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000 // 4 seconds timeout
    });
    isMongoConnected = true;
    console.log('Successfully connected to MongoDB Atlas. Using Cloud Database.');
  } catch (err) {
    isMongoConnected = false;
    console.error('MongoDB Atlas connection failed:', err.message);
    console.log('>>> FALLBACK ACTIVE: Using local file-based database (data/users.json & data/tasks.json).');
  }
}

connectDB();

// Local JSON DB Helpers
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify([]));
    }
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

// In-memory Session Store
const sessions = {}; 

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Helper
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  
  req.user = sessions[token]; // Contains user details: { id, username }
  next();
}

// --------------------------------------------------
// Authentication Endpoints
// --------------------------------------------------

// 1. User Registration
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const lowercaseUsername = username.toLowerCase().trim();

  try {
    let existingUser = null;
    
    if (isMongoConnected) {
      existingUser = await User.findOne({ username: lowercaseUsername });
    } else {
      const users = readJSON(USERS_FILE);
      existingUser = users.find(u => u.username === lowercaseUsername);
    }

    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const hashedPassword = hashPassword(password);
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const userData = {
      username: lowercaseUsername,
      password: hashedPassword
    };

    if (isMongoConnected) {
      const newUser = new User(userData);
      await newUser.save();
      userData.id = newUser._id.toString();
    } else {
      const users = readJSON(USERS_FILE);
      userData.id = userId;
      users.push(userData);
      writeJSON(USERS_FILE, users);
    }

    // Auto-login after registration
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = { id: userData.id, username: userData.username };

    res.status(201).json({ 
      message: 'Registration successful',
      token, 
      user: { id: userData.id, username: userData.username } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// 2. User Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const lowercaseUsername = username.toLowerCase().trim();

  try {
    let user = null;
    
    if (isMongoConnected) {
      user = await User.findOne({ username: lowercaseUsername });
    } else {
      const users = readJSON(USERS_FILE);
      user = users.find(u => u.username === lowercaseUsername);
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const hashedPassword = hashPassword(password);
    if (user.password !== hashedPassword) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const userId = isMongoConnected ? user._id.toString() : user.id;

    // Generate Session Token
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = { id: userId, username: user.username };

    res.json({
      message: 'Login successful',
      token,
      user: { id: userId, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// 3. User Logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token && sessions[token]) {
    delete sessions[token];
  }
  
  res.json({ message: 'Logout successful' });
});

// --------------------------------------------------
// Protected Tasks API Endpoints
// --------------------------------------------------

// 1. Get all tasks for the logged-in user
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    let formattedTasks = [];

    if (isMongoConnected) {
      const tasks = await Task.find({ userId: req.user.id }).sort({ customOrder: 1 });
      formattedTasks = tasks.map(task => ({
        id: task._id.toString(),
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        priority: task.priority,
        completed: task.completed,
        createdAt: task.createdAt.getTime()
      }));
    } else {
      const tasks = readJSON(TASKS_FILE);
      const userTasks = tasks.filter(t => t.userId === req.user.id);
      userTasks.sort((a, b) => (a.customOrder || 0) - (b.customOrder || 0));
      formattedTasks = userTasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        priority: task.priority,
        completed: task.completed,
        createdAt: task.createdAt
      }));
    }

    res.json(formattedTasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Failed to retrieve tasks from server' });
  }
});

// 2. Create a new task
app.post('/api/tasks', authenticateToken, async (req, res) => {
  const { title, description, dueDate, priority, completed, id, createdAt } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const timeVal = createdAt || Date.now();
    const taskId = id || 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    let newTaskResponse = {};

    if (isMongoConnected) {
      const count = await Task.countDocuments({ userId: req.user.id });
      const taskData = {
        userId: req.user.id,
        title: title.trim(),
        description: description || '',
        dueDate: dueDate || '',
        priority: priority || 'low',
        completed: completed || false,
        customOrder: count
      };

      if (id && mongoose.Types.ObjectId.isValid(id)) {
        taskData._id = id;
      }
      if (createdAt) {
        taskData.createdAt = new Date(createdAt);
      }

      const newTask = new Task(taskData);
      await newTask.save();
      
      newTaskResponse = {
        id: newTask._id.toString(),
        title: newTask.title,
        description: newTask.description,
        dueDate: newTask.dueDate,
        priority: newTask.priority,
        completed: newTask.completed,
        createdAt: newTask.createdAt.getTime()
      };
    } else {
      const tasks = readJSON(TASKS_FILE);
      const userTasksCount = tasks.filter(t => t.userId === req.user.id).length;
      
      const newTask = {
        id: taskId,
        userId: req.user.id,
        title: title.trim(),
        description: description || '',
        dueDate: dueDate || '',
        priority: priority || 'low',
        completed: completed || false,
        createdAt: timeVal,
        customOrder: userTasksCount
      };

      tasks.push(newTask);
      writeJSON(TASKS_FILE, tasks);
      
      newTaskResponse = {
        id: newTask.id,
        title: newTask.title,
        description: newTask.description,
        dueDate: newTask.dueDate,
        priority: newTask.priority,
        completed: newTask.completed,
        createdAt: newTask.createdAt
      };
    }

    res.status(201).json(newTaskResponse);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Failed to save task to server' });
  }
});

// 3. Update an existing task
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  const taskId = req.params.id;
  const { title, description, dueDate, priority, completed } = req.body;

  try {
    let updatedTaskResponse = null;

    if (isMongoConnected) {
      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID format' });
      }

      const updates = {};
      if (title !== undefined) updates.title = title.trim();
      if (description !== undefined) updates.description = description;
      if (dueDate !== undefined) updates.dueDate = dueDate;
      if (priority !== undefined) updates.priority = priority;
      if (completed !== undefined) updates.completed = completed;

      const updatedTask = await Task.findOneAndUpdate(
        { _id: taskId, userId: req.user.id },
        { $set: updates },
        { new: true }
      );

      if (updatedTask) {
        updatedTaskResponse = {
          id: updatedTask._id.toString(),
          title: updatedTask.title,
          description: updatedTask.description,
          dueDate: updatedTask.dueDate,
          priority: updatedTask.priority,
          completed: updatedTask.completed,
          createdAt: updatedTask.createdAt.getTime()
        };
      }
    } else {
      const tasks = readJSON(TASKS_FILE);
      const index = tasks.findIndex(t => t.id === taskId && t.userId === req.user.id);
      
      if (index > -1) {
        if (title !== undefined) tasks[index].title = title.trim();
        if (description !== undefined) tasks[index].description = description;
        if (dueDate !== undefined) tasks[index].dueDate = dueDate;
        if (priority !== undefined) tasks[index].priority = priority;
        if (completed !== undefined) tasks[index].completed = completed;
        
        writeJSON(TASKS_FILE, tasks);
        
        updatedTaskResponse = {
          id: tasks[index].id,
          title: tasks[index].title,
          description: tasks[index].description,
          dueDate: tasks[index].dueDate,
          priority: tasks[index].priority,
          completed: tasks[index].completed,
          createdAt: tasks[index].createdAt
        };
      }
    }

    if (!updatedTaskResponse) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    res.json(updatedTaskResponse);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Failed to update task details' });
  }
});

// 4. Delete a task
app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  const taskId = req.params.id;

  try {
    let deletedTaskResponse = null;

    if (isMongoConnected) {
      if (!mongoose.Types.ObjectId.isValid(taskId)) {
        return res.status(400).json({ error: 'Invalid task ID format' });
      }

      const deletedTask = await Task.findOneAndDelete({ _id: taskId, userId: req.user.id });
      if (deletedTask) {
        deletedTaskResponse = {
          id: deletedTask._id.toString(),
          title: deletedTask.title,
          description: deletedTask.description,
          dueDate: deletedTask.dueDate,
          priority: deletedTask.priority,
          completed: deletedTask.completed,
          createdAt: deletedTask.createdAt.getTime()
        };
      }
    } else {
      const tasks = readJSON(TASKS_FILE);
      const index = tasks.findIndex(t => t.id === taskId && t.userId === req.user.id);
      
      if (index > -1) {
        const deletedTask = tasks[index];
        tasks.splice(index, 1);
        writeJSON(TASKS_FILE, tasks);
        
        deletedTaskResponse = {
          id: deletedTask.id,
          title: deletedTask.title,
          description: deletedTask.description,
          dueDate: deletedTask.dueDate,
          priority: deletedTask.priority,
          completed: deletedTask.completed,
          createdAt: deletedTask.createdAt
        };
      }
    }

    if (!deletedTaskResponse) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    res.json({
      message: 'Task deleted successfully',
      task: deletedTaskResponse
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Failed to delete task from server' });
  }
});

// 5. Reorder tasks custom drag-and-drop index save
app.post('/api/tasks/reorder', authenticateToken, async (req, res) => {
  const { orderedIds } = req.body;

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds array is required' });
  }

  try {
    if (isMongoConnected) {
      const updatePromises = orderedIds.map((id, index) => {
        if (mongoose.Types.ObjectId.isValid(id)) {
          return Task.updateOne(
            { _id: id, userId: req.user.id },
            { $set: { customOrder: index } }
          );
        }
      });
      await Promise.all(updatePromises);
    } else {
      const tasks = readJSON(TASKS_FILE);
      orderedIds.forEach((id, index) => {
        const task = tasks.find(t => t.id === id && t.userId === req.user.id);
        if (task) {
          task.customOrder = index;
        }
      });
      writeJSON(TASKS_FILE, tasks);
    }

    res.json({ message: 'Custom order updated successfully' });
  } catch (error) {
    console.error('Reorder tasks error:', error);
    res.status(500).json({ error: 'Failed to sync custom order to server' });
  }
});

// 6. Clear completed tasks
app.delete('/api/tasks/clear/completed', authenticateToken, async (req, res) => {
  try {
    let clearedCount = 0;

    if (isMongoConnected) {
      const result = await Task.deleteMany({ userId: req.user.id, completed: true });
      clearedCount = result.deletedCount;
    } else {
      const tasks = readJSON(TASKS_FILE);
      const activeTasks = tasks.filter(t => !(t.userId === req.user.id && t.completed));
      clearedCount = tasks.length - activeTasks.length;
      writeJSON(TASKS_FILE, activeTasks);
    }

    res.json({ message: 'Cleared completed tasks', clearedCount });
  } catch (error) {
    console.error('Clear completed error:', error);
    res.status(500).json({ error: 'Failed to clear completed tasks' });
  }
});

// Serve frontend SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
