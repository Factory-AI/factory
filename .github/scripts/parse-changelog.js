#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseChangelog(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract the first <Update> block
  const updateMatch = content.match(/<Update\s+label="([^"]+)"\s+rss=\{\{\s*title:\s*"([^"]+)",\s*description:\s*"([^"]+)"\s*\}\}>([\s\S]*?)<\/Update>/);
  
  if (!updateMatch) {
    console.error('No update block found');
    process.exit(1);
  }
  
  const [, date, title, description, body] = updateMatch;
  
  // Extract version number
  const versionMatch = body.match(/`([^`]+)`/);
  const version = versionMatch ? versionMatch[1] : '';
  
  // Extract sections
  const newFeaturesMatch = body.match(/## New features\s*([\s\S]*?)(?=##|\s*<\/Update>|$)/);
  const bugFixesMatch = body.match(/## Bug fixes\s*([\s\S]*?)(?=##|\s*<\/Update>|$)/);
  const enhancementsMatch = body.match(/## New features and enhancements\s*([\s\S]*?)(?=##|\s*<\/Update>|$)/);
  const stabilityMatch = body.match(/## Bug fixes and stability\s*([\s\S]*?)(?=##|\s*<\/Update>|$)/);
  
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
          bullets.push(`• ${match[1]}${match[2] ? ': ' + match[2] : ''}`);
        }
      } else if (trimmed.startsWith('* ')) {
        bullets.push(`• ${trimmed.substring(2)}`);
      }
    }
    return bullets;
  }
  
  const newFeatures = extractBullets(newFeaturesMatch?.[1] || enhancementsMatch?.[1] || '');
  const bugFixes = extractBullets(bugFixesMatch?.[1] || stabilityMatch?.[1] || '');
  
  // Get changelog URL
  const fileName = path.basename(filePath, '.mdx');
  const changelogUrl = `https://docs.factory.ai/changelog/${fileName}`;
  
  // Build Discord message
  let message = `📝 **New Factory Changelog`;
  if (version) {
    message += `: ${version}**`;
  } else {
    message += `**`;
  }
  message += ` (${date})\n\n`;
  
  if (newFeatures.length > 0) {
    message += `**New features**\n`;
    message += newFeatures.slice(0, 5).join('\n') + '\n\n';
  }
  
  if (bugFixes.length > 0) {
    message += `**Bug fixes**\n`;
    message += bugFixes.slice(0, 5).join('\n') + '\n\n';
  }
  
  message += `View full changelog: ${changelogUrl}`;
  
  // Trim message to Discord's 2000 character limit
  if (message.length > 2000) {
    message = message.substring(0, 1950) + '...\n\n' + `View full changelog: ${changelogUrl}`;
  }
  
  return message;
}

// Main execution
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node parse-changelog.js <path-to-changelog.mdx>');
    process.exit(1);
  }
  
  try {
    const message = parseChangelog(filePath);
    console.log(message);
  } catch (error) {
    console.error('Error parsing changelog:', error.message);
    process.exit(1);
  }
}

module.exports = { parseChangelog };
