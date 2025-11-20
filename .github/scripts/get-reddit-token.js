#!/usr/bin/env node

/**
 * Script to get Reddit refresh token for posting changelogs
 * Run: node .github/scripts/get-reddit-token.js
 * 
 * You'll need:
 * - Reddit app client ID
 * - Reddit app secret
 * - Your Reddit username
 * - Your Reddit password
 */

const readline = require('readline');
const https = require('https');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getRefreshToken() {
  console.log('\n🤖 Reddit OAuth Token Generator for Factory Changelog Bot\n');
  console.log('This will generate a refresh token for posting to Reddit as your account.\n');
  
  const clientId = await question('Enter your Reddit app CLIENT ID: ');
  const clientSecret = await question('Enter your Reddit app SECRET: ');
  const username = await question('Enter your Reddit USERNAME: ');
  const password = await question('Enter your Reddit PASSWORD: ');
  
  console.log('\n🔄 Requesting access token...\n');
  
  // Create Basic Auth header
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  // Request token
  const tokenData = `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  
  const options = {
    hostname: 'www.reddit.com',
    path: '/api/v1/access_token',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'FactoryChangelogBot/1.0'
    }
  };
  
  try {
    const response = await makeRequest(options, tokenData);
    
    if (response.error) {
      console.error('❌ Error:', response.error);
      if (response.error === 'invalid_grant') {
        console.error('Invalid username or password. Please check your credentials.');
      }
      process.exit(1);
    }
    
    if (response.access_token) {
      console.log('✅ Success! Here are your credentials:\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Add these as GitHub Secrets in your repository:');
      console.log('(Settings → Secrets and variables → Actions → New repository secret)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log(`REDDIT_CLIENT_ID = ${clientId}`);
      console.log(`REDDIT_CLIENT_SECRET = ${clientSecret}`);
      console.log(`REDDIT_USERNAME = ${username}`);
      console.log(`REDDIT_PASSWORD = ${password}`);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('⚠️  Keep these credentials secure! They give full access to your Reddit account.\n');
    } else {
      console.error('❌ Unexpected response:', response);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
  
  rl.close();
}

getRefreshToken();
