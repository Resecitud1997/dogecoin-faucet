// backend/src/server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Dogecoin Service
const dogecoinService = {
  async validateAddress(address) {
    // Validate Dogecoin address format
    const regex = /^D[A-Za-z0-9]{33}$/;
    return regex.test(address);
  },

  async sendDogecoin(address, amount) {
    // Integration with Dogecoin Core RPC
    const bitcoin = require('bitcoin');
    const client = new bitcoin.Client({
      host: process.env.DOGE_RPC_HOST,
      port: process.env.DOGE_RPC_PORT,
      user: process.env.DOGE_RPC_USER,
      pass: process.env.DOGE_RPC_PASSWORD
    });

    return new Promise((resolve, reject) => {
      client.sendToAddress(address, amount, (err, txid) => {
        if (err) reject(err);
        else resolve(txid);
      });
    });
  },

  async getBalance() {
    const bitcoin = require('bitcoin');
    const client = new bitcoin.Client({
      host: process.env.DOGE_RPC_HOST,
      port: process.env.DOGE_RPC_PORT,
      user: process.env.DOGE_RPC_USER,
      pass: process.env.DOGE_RPC_PASSWORD
    });

    return new Promise((resolve, reject) => {
      client.getBalance((err, balance) => {
        if (err) reject(err);
        else resolve(balance);
      });
    });
  }
};

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Routes

// Register/Login with wallet
app.post('/api/auth/connect', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!dogecoinService.validateAddress(walletAddress)) {
      return res.status(400).json({ error: 'Invalid Dogecoin address' });
    }

    // Check if user exists
    let user = await pool.query(
      'SELECT * FROM users WHERE wallet_address = $1',
      [walletAddress]
    );

    if (user.rows.length === 0) {
      // Create new user
      const referralCode = Math.random().toString(36).substring(7).toUpperCase();
      user = await pool.query(
        'INSERT INTO users (wallet_address, referral_code) VALUES ($1, $2) RETURNING *',
        [walletAddress, referralCode]
      );
    }

    const token = jwt.sign(
      { userId: user.rows[0].id, walletAddress },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.rows[0].id,
        walletAddress: user.rows[0].wallet_address,
        balance: parseFloat(user.rows[0].balance),
        totalEarned: parseFloat(user.rows[0].total_earned),
        referralCode: user.rows[0].referral_code
      }
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user balance
app.get('/api/user/balance', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT balance, total_earned FROM users WHERE id = $1',
      [req.user.userId]
    );

    res.json({
      balance: parseFloat(result.rows[0].balance),
      totalEarned: parseFloat(result.rows[0].total_earned)
    });
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get available tasks
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await pool.query(
      'SELECT * FROM tasks WHERE enabled = true'
    );

    // Check last completion time for each task
    const tasksWithStatus = await Promise.all(
      tasks.rows.map(async (task) => {
        const lastCompletion = await pool.query(
          'SELECT completed_at FROM task_completions WHERE user_id = $1 AND task_id = $2 ORDER BY completed_at DESC LIMIT 1',
          [req.user.userId, task.id]
        );

        const canClaim = lastCompletion.rows.length === 0 ||
          (Date.now() - new Date(lastCompletion.rows[0].completed_at).getTime()) > task.cooldown * 1000;

        return {
          id: task.id,
          name: task.name,
          reward: parseFloat(task.reward),
          cooldown: task.cooldown,
          canClaim,
          lastCompleted: lastCompletion.rows[0]?.completed_at
        };
      })
    );

    res.json({ tasks: tasksWithStatus });
  } catch (error) {
    console.error('Tasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Claim task reward
app.post('/api/tasks/:id/claim', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const taskId = parseInt(req.params.id);
    const ipAddress = req.ip;

    // Get task details
    const task = await client.query(
      'SELECT * FROM tasks WHERE id = $1 AND enabled = true',
      [taskId]
    );

    if (task.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check cooldown
    const lastCompletion = await client.query(
      'SELECT completed_at FROM task_completions WHERE user_id = $1 AND task_id = $2 ORDER BY completed_at DESC LIMIT 1',
      [req.user.userId, taskId]
    );

    if (lastCompletion.rows.length > 0) {
      const timeSince = Date.now() - new Date(lastCompletion.rows[0].completed_at).getTime();
      if (timeSince < task.rows[0].cooldown * 1000) {
        await client.query('ROLLBACK');
        return res.status(429).json({ 
          error: 'Cooldown period not yet elapsed',
          remainingTime: Math.ceil((task.rows[0].cooldown * 1000 - timeSince) / 1000)
        });
      }
    }

    // Add reward to user balance
    await client.query(
      'UPDATE users SET balance = balance + $1, total_earned = total_earned + $1 WHERE id = $2',
      [task.rows[0].reward, req.user.userId]
    );

    // Record task completion
    await client.query(
      'INSERT INTO task_completions (user_id, task_id, ip_address) VALUES ($1, $2, $3)',
      [req.user.userId, taskId, ipAddress]
    );

    // Create transaction record
    await client.query(
      'INSERT INTO transactions (user_id, type, amount, task_id, status) VALUES ($1, $2, $3, $4, $5)',
      [req.user.userId, 'earn', task.rows[0].reward, taskId, 'completed']
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      reward: parseFloat(task.rows[0].reward),
      newBalance: (await client.query('SELECT balance FROM users WHERE id = $1', [req.user.userId])).rows[0].balance
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Claim error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Request withdrawal
app.post('/api/withdraw', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const { amount } = req.body;
    const minWithdrawal = parseFloat(process.env.MIN_WITHDRAWAL || 5);
    const maxWithdrawal = parseFloat(process.env.MAX_WITHDRAWAL || 100);
    const fee = parseFloat(process.env.WITHDRAWAL_FEE || 0.1);

    if (amount < minWithdrawal) {
      return res.status(400).json({ error: `Minimum withdrawal is ${minWithdrawal} DOGE` });
    }

    if (amount > maxWithdrawal) {
      return res.status(400).json({ error: `Maximum withdrawal is ${maxWithdrawal} DOGE` });
    }

    // Get user data
    const user = await client.query(
      'SELECT * FROM users WHERE id = $1',
      [req.user.userId]
    );

    const userBalance = parseFloat(user.rows[0].balance);
    const totalAmount = amount + fee;

    if (userBalance < totalAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct from balance
    await client.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2',
      [totalAmount, req.user.userId]
    );

    // Create withdrawal transaction
    const transaction = await client.query(
      'INSERT INTO transactions (user_id, type, amount, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.userId, 'withdraw', amount, 'pending']
    );

    // Process withdrawal (async)
    setTimeout(async () => {
      try {
        const txHash = await dogecoinService.sendDogecoin(
          user.rows[0].wallet_address,
          amount
        );

        await pool.query(
          'UPDATE transactions SET status = $1, tx_hash = $2 WHERE id = $3',
          ['completed', txHash, transaction.rows[0].id]
        );
      } catch (error) {
        console.error('Withdrawal processing error:', error);
        // Refund on error
        await pool.query(
          'UPDATE users SET balance = balance + $1 WHERE id = $2',
          [totalAmount, req.user.userId]
        );
        await pool.query(
          'UPDATE transactions SET status = $1 WHERE id = $2',
          ['failed', transaction.rows[0].id]
        );
      }
    }, 1000);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Withdrawal request submitted',
      transactionId: transaction.rows[0].id,
      amount,
      fee,
      estimatedTime: '24-48 hours'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Withdrawal error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Get transaction history
app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const transactions = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.userId]
    );

    res.json({
      transactions: transactions.rows.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        status: tx.status,
        txHash: tx.tx_hash,
        createdAt: tx.created_at
      }))
    });
  } catch (error) {
    console.error('Transactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Dogecoin Faucet API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
