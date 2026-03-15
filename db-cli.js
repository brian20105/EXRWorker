#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

async function query(sql) {
  try {
    await client.connect();
    console.log('Connected to Neon database');
    
    const result = await client.query(sql);
    console.log('\nQuery Results:');
    console.table(result.rows);
    
    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

const sql = process.argv[2] || 'SELECT 1;';
query(sql);
