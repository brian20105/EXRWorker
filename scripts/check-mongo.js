#!/usr/bin/env node
// Diagnostic script: checks DNS SRV, TCP connectivity, and attempts a mongoose connection
import dns from 'dns';
import net from 'net';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set in .env');
  process.exit(2);
}

function parseHostFromUri(u) {
  try {
    // handle mongodb+srv://user:pass@host/...
    const m = u.match(/@([^/\?]+)(?:[\/\?]|$)/);
    if (m) return m[1];
  } catch (e) {}
  return null;
}

async function checkSrv(host) {
  return new Promise((resolve) => {
    dns.resolveSrv(`_mongodb._tcp.${host}`, (err, addresses) => {
      if (err) return resolve({ ok: false, error: err });
      resolve({ ok: true, addresses });
    });
  });
}

async function checkTcp(host, port = 27017, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve({ ok: true });
    });
    socket.setTimeout(timeout);
    socket.on('error', (err) => resolve({ ok: false, error: err }));
    socket.on('timeout', () => { socket.destroy(); resolve({ ok: false, error: new Error('timeout') }); });
  });
}

async function tryMongooseConnect(u, timeoutMs = 5000) {
  try {
    const conn = await mongoose.createConnection(u, { serverSelectionTimeoutMS: timeoutMs }).asPromise();
    await conn.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

(async () => {
  console.log('MONGODB_URI:', uri.startsWith('mongodb+srv') ? 'mongodb+srv://...' : 'mongodb://...');
  const host = parseHostFromUri(uri);
  if (!host) {
    console.log('Could not parse host from MONGODB_URI');
  } else {
    console.log('Host parsed:', host);
    console.log('Checking SRV records...');
    const srv = await checkSrv(host);
    console.log('SRV check:', srv.ok ? `found ${srv.addresses.length} records` : `failed: ${srv.error}`);

    console.log('Checking TCP to host:27017...');
    const tcp = await checkTcp(host, 27017);
    console.log('TCP check:', tcp.ok ? 'ok' : `failed: ${tcp.error}`);
  }

  console.log('Attempting mongoose connect (short timeout)...');
  const mongoRes = await tryMongooseConnect(uri, 5000);
  if (mongoRes.ok) console.log('Mongoose connection successful');
  else console.error('Mongoose connection failed:', mongoRes.error && (mongoRes.error.stack || mongoRes.error.message || mongoRes.error));

  process.exit(mongoRes.ok ? 0 : 1);
})();
