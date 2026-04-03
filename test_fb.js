const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function run() {
  const db = await open({ filename: path.join(__dirname, 'database.sqlite'), driver: sqlite3.Database });
  const intgs = await db.all('SELECT * FROM ShopIntegrations');
  
  for (const shop of intgs) {
    if(shop.platform.startsWith('facebook') && shop.status === 'connected') {
      const url = `https://graph.facebook.com/v21.0/26148465121442121?fields=first_name,last_name,profile_pic&access_token=${shop.access_token}`;
      const res = await fetch(url);
      const json = await res.json();
      console.log('FB Profile for PSID 26148465121442121 using PAGE:', shop.page_id, '->', JSON.stringify(json));
    }
  }
}
run();
