// backend/src/services/dogecoin.js
const bitcoin = require('bitcoin');
const client = new bitcoin.Client({
  host: process.env.DOGE_RPC_HOST,
  port: process.env.DOGE_RPC_PORT,
  user: process.env.DOGE_RPC_USER,
  pass: process.env.DOGE_RPC_PASSWORD
});

async function sendDogecoin(address, amount) {
  return new Promise((resolve, reject) => {
    client.sendToAddress(address, amount, (err, txid) => {
      if (err) reject(err);
      else resolve(txid);
    });
  });
}
