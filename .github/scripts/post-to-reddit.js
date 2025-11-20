#!/usr/bin/env node

/**
 * Posts changelog updates to Reddit
 * Usage: node post-to-reddit.js <changelog-file-path>
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getAccessToken(clientId, clientSecret, username, password) {
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokenData = `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  
  const options = {
    hostname: 'www.reddit.com',
    path: '/api/v1/access_token',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'FactoryChangelogBot/1.0 (by /u/' + username + ')'
    }
  };
  
  const response = await makeRequest(options, tokenData);
  
  if (response.data.error) {
    throw new Error(`Reddit OAuth error: ${response.data.error}`);
  }
  
  return response.data.access_token;
}

function parseChangelog(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract the first <Update> block
  const updateMatch = content.match(/<Update\s+label="([^"]+)"\s+rss=\{\{\s*title:\s*"([^"]+)",\s*description:\s*"([^"]+)"\s*\}\}>([\s\S]*?)<\/Update>/);
  
  if (!updateMatch) {
    throw new Error('No update block found');
  }
  
  const [, date, title, description, body] = updateMatch;
  
  // Extract version number
  const versionMatch = body.match(/`([^`]+)`/);
  const version = versionMatch ? versionMatch[1] : '';
  
  // Extract sections
  const newFeaturesMatch = body.match(/## New features\s*([\s\S]*?)(?=##|\s*<\/Update>|$)/);
  const bugFixesMatch = body.match(/## Bug fixes\s*([\s\S]*?)(?=##|\s*<\/Update>|$)/);
  
  // Extract bullet points
  function extractBullets(text) {
    if (!text) return [];
    const bullets = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('* **')) {
        // Extract bold title and description
        const match = trimmed.match(/\*\s+\*\*([^*]+)\*\*:?\s*-?\s*(.*)/);
        if (match) {
          bullets.push(`**${match[1]}**${match[2] ? ' - ' + match[2] : ''}`);
        }
      } else if (trimmed.startsWith('* ')) {
        bullets.push(trimmed.substring(2));
      }
    }
    return bullets;
  }
  
  const newFeatures = extractBullets(newFeaturesMatch?.[1] || '');
  const bugFixes = extractBullets(bugFixesMatch?.[1] || '');
  
  return { date, title, description, version, newFeatures, bugFixes };
}

function formatRedditPost(changelog, changelogUrl) {
  const { date, version, newFeatures, bugFixes } = changelog;
  
  // Build Reddit post body (Markdown format)
  let body = '';
  
  if (newFeatures.length > 0) {
    body += `## New features\n\n`;
    body += newFeatures.map(f => `* ${f}`).join('\n') + '\n\n';
  }
  
  if (bugFixes.length > 0) {
    body += `## Bug fixes\n\n`;
    body += bugFixes.map(f => `* ${f}`).join('\n') + '\n\n';
  }
  
  body += `---\n\n`;
  body += `[View full changelog](${changelogUrl})`;
  
  // Create title
  let postTitle = `Factory CLI ${version} Released`;
  if (newFeatures.length > 0) {
    // Add first feature to title
    const firstFeature = newFeatures[0].replace(/\*\*/g, '').split(' - ')[0];
    postTitle += ` - ${firstFeature}`;
    if (newFeatures.length > 1) {
      postTitle += ` and more`;
    }
  }
  
  // Limit title to 300 chars (Reddit limit)
  if (postTitle.length > 297) {
    postTitle = postTitle.substring(0, 297) + '...';
  }
  
  return { title: postTitle, body };
}

async function postToReddit(subreddit, title, body, accessToken) {
  // Reddit API expects form-encoded data, not JSON
  const params = new URLSearchParams({
    sr: subreddit,
    kind: 'self',
    title: title,
    text: body,
    sendreplies: 'false',
    api_type: 'json'
  });
  const postData = params.toString();
  
  const options = {
    hostname: 'oauth.reddit.com',
    path: '/api/submit',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'FactoryChangelogBot/1.0'
    }
  };
  
  const response = await makeRequest(options, postData);
  
  if (response.data.json?.errors?.length > 0) {
    throw new Error(`Reddit API error: ${JSON.stringify(response.data.json.errors)}`);
  }
  
  if (response.data.json?.data?.url) {
    return response.data.json.data.url;
  }
  
  throw new Error(`Unexpected Reddit response: ${JSON.stringify(response.data)}`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node post-to-reddit.js <path-to-changelog.mdx>');
    process.exit(1);
  }
  
  // Get credentials from environment
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  const subreddit = process.env.REDDIT_SUBREDDIT || 'FactoryAi';
  
  if (!clientId || !clientSecret || !username || !password) {
    console.error('Missing required environment variables:');
    console.error('REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD');
    process.exit(1);
  }
  
  try {
    console.log('📝 Parsing changelog...');
    const changelog = parseChangelog(filePath);
    console.log(`Found version: ${changelog.version}`);
    
    // Get changelog URL
    const fileName = path.basename(filePath, '.mdx');
    const changelogUrl = `https://docs.factory.ai/changelog/${fileName}`;
    
    console.log('🔑 Getting Reddit access token...');
    const accessToken = await getAccessToken(clientId, clientSecret, username, password);
    
    console.log('📤 Formatting post...');
    const { title, body } = formatRedditPost(changelog, changelogUrl);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Post Preview:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Title: ${title}`);
    console.log('\nBody:');
    console.log(body);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`🚀 Posting to r/${subreddit}...`);
    const postUrl = await postToReddit(subreddit, title, body, accessToken);
    
    console.log(`✅ Successfully posted to Reddit!`);
    console.log(`🔗 ${postUrl}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
