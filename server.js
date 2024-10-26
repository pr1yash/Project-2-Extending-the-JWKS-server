import express from 'express';
import jwt from 'jsonwebtoken';
import jose from 'node-jose';
import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = 8080;

// Allow database path to be set via environment variable for testing
const dbPath = process.env.DB_PATH || join(__dirname, 'totally_not_my_privateKeys.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error when connecting to the database:', err.message);
  } else {
    console.log('Connected to the SQLite database at', dbPath);
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS keys(
        kid INTEGER PRIMARY KEY AUTOINCREMENT,
        key BLOB NOT NULL,
        exp INTEGER NOT NULL
    )`);
});

async function generateAndStoreKeyPairs() {
  const keyPair = await jose.JWK.createKey('RSA', 2048, { alg: 'RS256', use: 'sig' });
  const expiredKeyPair = await jose.JWK.createKey('RSA', 2048, { alg: 'RS256', use: 'sig' });

  const keyInsert = db.prepare("INSERT INTO keys (key, exp) VALUES (?, ?)");
  keyInsert.run(keyPair.toPEM(true), Math.floor(Date.now() / 1000) + 3600);
  keyInsert.run(expiredKeyPair.toPEM(true), Math.floor(Date.now() / 1000) - 3600);
  keyInsert.finalize();
}

function generateTokenFromDB(callback) {
  db.get("SELECT key FROM keys WHERE exp > ? ORDER BY exp DESC LIMIT 1", [Math.floor(Date.now() / 1000)], async (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return callback(err);
    }
    if (!row) {
      console.error('No valid key found');
      return callback(new Error('No valid key found'));
    }
    try {
      const keyObj = await jose.JWK.asKey(row.key, 'pem');
      const payload = {
        user: 'sampleUser',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };
      const options = {
        algorithm: 'RS256',
        header: {
          typ: 'JWT',
          alg: 'RS256',
          kid: keyObj.kid
        }
      };
      const token = jwt.sign(payload, keyObj.toPEM(true), options);
      callback(null, { token: token }); // Ensure this is an object with a token property
    } catch (joseError) {
      console.error('JOSE error:', joseError);
      callback(joseError);
    }
  });
}


app.get('/ready', (req, res) => {
  res.sendStatus(200);  // Simple endpoint to check if the server is ready
});

app.all('/auth', (req, res, next) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  next();
});

app.all('/.well-known/jwks.json', (req, res, next) => {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }
  next();
});

app.get('/.well-known/jwks.json', (req, res) => {
  db.all("SELECT key FROM keys WHERE exp > ?", [Math.floor(Date.now() / 1000)], async (err, rows) => {
    if (err) {
      return res.status(500).send('Error fetching keys');
    }
    const keys = await Promise.all(rows.map(async row => {
      const key = await jose.JWK.asKey(row.key, 'pem');
      return key.toJSON();
    }));
    res.setHeader('Content-Type', 'application/json');
    res.json({ keys });
  });
});

app.post('/auth', (req, res) => {
  generateTokenFromDB((err, token) => {
    if (err) {
      return res.status(500).send('Error generating token');
    }
    res.send(token);
  });
});

generateAndStoreKeyPairs().then(() => {
  app.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`);
  });
});

export default app; // Exporting for testing purposes
