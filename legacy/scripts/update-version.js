#!/usr/bin/env node

/**
 * Update Version Script
 * 
 * This script updates version numbers in key files to force cache busting
 * for PWA deployments. Run this before each production deployment.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate version string with current date and time
const generateVersion = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}-${hour}${minute}`;
};

// Files to update with version
const filesToUpdate = [
  {
    path: 'public/sw.js',
    pattern: /const VERSION = '[^']+';/,
    replacement: (version) => `const VERSION = '${version}';`
  },
  {
    path: 'index.html',
    pattern: /<meta name="app-version" content="[^"]+" \/>/,
    replacement: (version) => `<meta name="app-version" content="${version}" />`
  }
];

const updateVersion = () => {
  const version = generateVersion();
  console.log(`🚀 Updating app version to: ${version}`);
  
  let updatedFiles = 0;
  
  filesToUpdate.forEach(({ path: filePath, pattern, replacement }) => {
    const fullPath = path.resolve(path.dirname(__dirname), filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  File not found: ${filePath}`);
      return;
    }
    
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const updatedContent = content.replace(pattern, replacement(version));
      
      if (content !== updatedContent) {
        fs.writeFileSync(fullPath, updatedContent, 'utf8');
        console.log(`✅ Updated: ${filePath}`);
        updatedFiles++;
      } else {
        console.log(`⏭️  No changes needed: ${filePath}`);
      }
    } catch (error) {
      console.error(`❌ Failed to update ${filePath}:`, error.message);
    }
  });
  
  console.log(`\n🎉 Version update complete! Updated ${updatedFiles} files.`);
  console.log(`📦 New version: ${version}`);
  console.log('\n💡 Next steps:');
  console.log('   1. Commit the version changes');
  console.log('   2. Deploy to production');
  console.log('   3. Users will be prompted to update their cached app');
};

// Run the update
updateVersion();