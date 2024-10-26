import request from 'supertest';
import { expect } from 'chai';
import app from '../server.js'; // Adjust this path if necessary to correctly point to your server.js file
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, 'totally_not_my_privateKeys.db');
const db = new sqlite3.Database(dbPath);

describe('JWT Authentication Server', function () {
    before((done) => {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS keys(
                kid INTEGER PRIMARY KEY AUTOINCREMENT,
                key BLOB NOT NULL,
                exp INTEGER NOT NULL
            )`, done);
        });
    });

    after((done) => {
        db.run('DROP TABLE keys', done);
    });

    describe('GET /ready', () => {
        it('should return HTTP 200 when the server is ready', (done) => {
            request(app)
                .get('/ready')
                .expect(200, done);
        });
    });

    describe('POST /auth', () => {
        it('should return a valid JWT token when authentication is successful', (done) => {
            // Setup: Ensure there is a valid key
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
    });

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

        it('should handle errors when fetching keys from the database', (done) => {
            done(); // Placeholder for actual error handling test
        });
    });

    describe('Enforce HTTP method restrictions', () => {
        it('should disallow GET requests on /auth', (done) => {
            request(app)
                .get('/auth')
                .expect(405, done);
        });

        it('should disallow POST requests on /.well-known/jwks.json', (done) => {
            request(app)
                .post('/.well-known/jwks.json')
                .expect(405, done);
        });
    });
});
