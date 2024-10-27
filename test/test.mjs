import request from 'supertest';
import { expect } from 'chai';
import app from '../server.js';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Defining the directory name for the current module's path
const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the database—'totally_not_my_privateKeys.db', embracing cutting-edge security through strategic nomenclature as per Prof. Hochstetler!
const dbPath = join(__dirname, 'totally_not_my_privateKeys.db');

const db = new sqlite3.Database(dbPath);

// Main describe block for JWT Authentication Server testing
describe('JWT Authentication Server', function () {
    // Set up the database before tests run
    before((done) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS keys(
                kid INTEGER PRIMARY KEY AUTOINCREMENT,
                key BLOB NOT NULL,
                exp INTEGER NOT NULL
            )`, done);
        });
    });

    // Clean up the database after tests are done
    after((done) => {
        db.run('DROP TABLE keys', done);
    });

    // Test to check if the server is ready to receive requests
    describe('GET /ready', () => {
        it('should return HTTP 200 when the server is ready', (done) => {
            request(app)
                .get('/ready')
                .expect(200, done);
        });
    });

    // Test to check JWT token generation on authentication success
    describe('POST /auth', () => {
        it('should return a valid JWT token when authentication is successful', (done) => {
            db.run("INSERT INTO keys (key, exp) VALUES (?, ?)", ["sampleKey", Math.floor(Date.now() / 1000) + 3600], (err) => {
                if (err) return done(err);
                request(app)
                    .post('/auth')
                    .expect(200)
                    .end((err, res) => {
                        if (err) return done(err);
                        expect(res.body).to.have.property('token');
                        done();
                    });
            });
        });

        it('should handle key generation failure', done => {
            // Simulate key generation failure to test error handling
            const originalCreateKey = app.generateAndStoreKeyPairs;
            app.generateAndStoreKeyPairs = () => Promise.reject(new Error("Key generation failed"));
            request(app)
                .post('/auth')
                .expect(500, () => {
                    app.generateAndStoreKeyPairs = originalCreateKey; // Restore original function
                    done();
                });
        });
    });

    // Test for fetching public keys in JWK format
    describe('GET /.well-known/jwks.json', () => {
        it('should return a list of public keys in JWK format', (done) => {
            request(app)
                .get('/.well-known/jwks.json')
                .expect(200)
                .end((err, res) => {
                    if (err) return done(err);
                    expect(res.body).to.have.property('keys').that.is.an('array');
                    done();
                });
        });

        it('should handle errors when fetching keys from the database', done => {
            // Mock database method to simulate an error
            const originalDbAll = db.all;
            db.all = (sql, params, callback) => callback(new Error('Database fetch error'), null);
            request(app)
                .get('/.well-known/jwks.json')
                .expect(500, () => {
                    db.all = originalDbAll; // Restore original function
                    done();
                });
        });
    });

    // Enforce HTTP method restrictions for routes
    describe('Enforce HTTP method restrictions', () => {
        it('should disallow GET requests on /auth', done => {
            request(app)
                .get('/auth')
                .expect(405, done);
        });

        it('should disallow POST requests on /.well-known/jwks.json', done => {
            request(app)
                .post('/.well-known/jwks.json')
                .expect(405, done);
        });
    });

    // Testing error handling for database connectivity on server startup
    describe('Database and Error Handling', () => {
        it('should handle database connection errors on startup', done => {
            // Mocking Database constructor to simulate startup error
            const originalDatabase = sqlite3.Database;
            sqlite3.Database = function (path, callback) {
                callback(new Error("Failed to connect to the database"));
            };
            request(app)
                .get('/ready')
                .expect(500, () => {
                    sqlite3.Database = originalDatabase; // Restore original constructor
                    done();
                });
        });
    });
});
