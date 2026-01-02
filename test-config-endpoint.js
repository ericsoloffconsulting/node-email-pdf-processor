/**
 * Test script to fetch AP Assist configurations from NetSuite RESTlet
 * 
 * Usage: node test-config-endpoint.js
 */

require('dotenv').config();
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const axios = require('axios');

async function testConfigEndpoint() {
  console.log('🧪 Testing NetSuite AP Assist Config Endpoint...\n');

  // Create OAuth signature
  const oauth = OAuth({
    consumer: {
      key: process.env.NETSUITE_CONSUMER_KEY,
      secret: process.env.NETSUITE_CONSUMER_SECRET
    },
    signature_method: 'HMAC-SHA256',
    hash_function(base_string, key) {
      return crypto.createHmac('sha256', key).update(base_string).digest('base64');
    }
  });

  const token = {
    key: process.env.NETSUITE_TOKEN_ID,
    secret: process.env.NETSUITE_TOKEN_SECRET
  };

  const requestData = {
    url: process.env.NETSUITE_RESTLET_URL + '&action=configs',
    method: 'GET'
  };

  const authHeader = oauth.toHeader(oauth.authorize(requestData, token));
  authHeader.Authorization += ',realm="' + process.env.NETSUITE_ACCOUNT_ID + '"';

  console.log('📡 Request Details:');
  console.log('   URL:', requestData.url);
  console.log('   Account:', process.env.NETSUITE_ACCOUNT_ID);
  console.log('   Method: GET\n');

  try {
    const response = await axios.get(requestData.url, {
      headers: {
        'Authorization': authHeader.Authorization,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Success!\n');
    console.log('Response Status:', response.status);
    console.log('Response Data:\n', JSON.stringify(response.data, null, 2));

    if (response.data.success && response.data.configs) {
      console.log('\n📊 Summary:');
      console.log('   Total configs:', response.data.count);
      console.log('   Timestamp:', response.data.timestamp);
      
      if (response.data.configs.length > 0) {
        console.log('\n📋 Processors Found:');
        response.data.configs.forEach((config, index) => {
          console.log('\n   ' + (index + 1) + '. ' + config.displayName);
          console.log('      Vendor:', config.vendor.name);
          console.log('      Transaction Type:', config.transactionType.name);
          console.log('      Email From:', config.emailFrom);
          console.log('      Email Subject Contains:', config.emailSubjectContains);
          console.log('      PDF Folder ID:', config.pdfFolderId);
          console.log('      JSON Folder ID:', config.jsonFolderId);
          console.log('      Has Custom Prompt:', !!config.claudePrompt);
          if (config.claudePrompt) {
            console.log('      Prompt Preview:', config.claudePrompt.substring(0, 80) + '...');
          }
        });
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
testConfigEndpoint();
