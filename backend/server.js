// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const TOKEN_CONTRACT_ADDRESS = '0xd73140ee4b85d9a7797573692ef97c7d3d0cd776';
const CACHE_FILE_PATH = path.join(__dirname, 'data.json');

// CORS設定
app.use(cors({
  origin: '*' // 開発中は一旦すべて許可。本番ではフロントエンドのドメインに限定します。
}));

// PolygonScanからデータを取得し、必要な情報を抽出・加工する関数
const fetchAndProcessData = async () => {
  console.log('Fetching new data from PolygonScan...');
  try {
    if (!POLYGONSCAN_API_KEY || POLYGONSCAN_API_KEY === 'YOUR_POLYGONSCAN_API_KEY_HERE') {
      throw new Error('PolygonScan API key is not configured in .env file.');
    }

    const url = `https://api.polygonscan.com/api?module=account&action=tokennfttx&contractaddress=${TOKEN_CONTRACT_ADDRESS}&page=1&offset=10000&sort=asc&apikey=${POLYGONSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== '1') {
      throw new Error(`Failed to fetch data from PolygonScan: ${data.message}`);
    }

    const transfers = data.result;

    // フロントエンドのロジックを再利用してデータを処理
    let vanillaMembers = new Set();
    let chocomintMembers = new Set();
    let vanillaInviteCount = 0;
    let chocomintInviteCount = 0;
    let vanillaInviterCounts = new Map();
    let chocomintInviterCounts = new Map();

    transfers.forEach(tx => {
      const tokenId = parseInt(tx.tokenID);
      const fromAddress = tx.from.toLowerCase();
      const toAddress = tx.to.toLowerCase();

      if (tokenId === 1 && toAddress !== '0x0000000000000000000000000000000000000000') {
        vanillaMembers.add(toAddress);
      } else if (tokenId === 3 && toAddress !== '0x0000000000000000000000000000000000000000') {
        chocomintMembers.add(toAddress);
      }

      if (tokenId === 0 && fromAddress !== '0x0000000000000000000000000000000000000000') {
        vanillaInviteCount++;
        vanillaInviterCounts.set(fromAddress, (vanillaInviterCounts.get(fromAddress) || 0) + 1);
      } else if (tokenId === 2 && fromAddress !== '0x0000000000000000000000000000000000000000') {
        chocomintInviteCount++;
        chocomintInviterCounts.set(fromAddress, (chocomintInviterCounts.get(fromAddress) || 0) + 1);
      }
    });

    const maxVanillaInvites = vanillaInviterCounts.size > 0 ? Math.max(...vanillaInviterCounts.values()) : 0;
    const maxChocomintInvites = chocomintInviterCounts.size > 0 ? Math.max(...chocomintInviterCounts.values()) : 0;

    const processedData = {
      vanillaMembersCount: vanillaMembers.size,
      chocomintMembersCount: chocomintMembers.size,
      vanillaInviteCount,
      chocomintInviteCount,
      vanillaTopInviterCount: maxVanillaInvites,
      chocomintTopInviterCount: maxChocomintInvites,
      lastUpdated: new Date().toISOString()
    };

    // データをJSONファイルにキャッシュ
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(processedData, null, 2));
    console.log('Data successfully fetched and cached.');
    return processedData;

  } catch (error) {
    console.error('Error fetching or processing data:', error);
    // エラーが発生しても、古いキャッシュがあればそれを使うため、ここではエラーを投げない
    return null;
  }
};

// APIエンドポイント: キャッシュされたデータを返す
app.get('/api/data', async (req, res) => {
  try {
    const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    res.json(JSON.parse(cachedData));
  } catch (error) {
    // キャッシュファイルがない場合（初回起動時など）
    if (error.code === 'ENOENT') {
      console.log('Cache not found, fetching new data...');
      const newData = await fetchAndProcessData();
      if (newData) {
        res.json(newData);
      } else {
        res.status(500).json({ message: 'Failed to fetch data. Please check server logs.' });
      }
    } else {
      res.status(500).json({ message: 'Error reading cache file.', error: error.message });
    }
  }
});

// サーバー起動と定期的なデータ更新
app.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
  
  // サーバー起動時にまず一度データを取得
  fetchAndProcessData();

  // その後、1時間ごとにデータを更新
  const oneHour = 60 * 60 * 1000;
  setInterval(fetchAndProcessData, oneHour);
});