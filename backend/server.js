// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// --- 環境変数 ---
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const TOKEN_CONTRACT_ADDRESS = '0xd73140ee4b85d9a7797573692ef97c7d3d0cd776';
const CACHE_FILE_PATH = path.join(__dirname, 'data.json');

// ★★★ 表示したい、既存のGraph CommonsグラフID ★★★
const GC_GRAPH_ID = process.env.GC_GRAPH_ID;

// CORS設定
app.use(cors({ origin: '*' }));
app.use(express.json());

// === メイン処理 ===
// サーバー起動時に一度だけ実行されるメイン処理
const initialize = async () => {
  console.log('--- 初期化処理を開始 --- ');
  try {
    // 1. PolygonScanからデータを取得
    console.log('1. PolygonScanからデータを取得中...');
    if (!POLYGONSCAN_API_KEY) throw new Error('POLYGONSCAN_API_KEYが設定されていません。');
    const url = `https://api.polygonscan.com/api?module=account&action=tokennfttx&contractaddress=${TOKEN_CONTRACT_ADDRESS}&page=1&offset=10000&sort=asc&apikey=${POLYGONSCAN_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== '1') throw new Error(`PolygonScanからのデータ取得失敗: ${data.message}`);
    const transfers = data.result;
    console.log(`${transfers.length}件のトランザクションを取得しました。`);

    // 2. フロントエンド用の集計データを計算
    console.log('2. フロントエンド用のデータを集計中...');
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

    // 3. 既存グラフの埋め込みURLを生成
    console.log('3. 既存のGraph CommonsグラフのURLを生成中...');
    const embedUrl = GC_GRAPH_ID
      ? `https://graphcommons.com/graphs/${GC_GRAPH_ID}/embed`
      : null;

    if (!embedUrl) {
      console.warn('警告: .envファイルにGC_GRAPH_IDが設定されていません。グラフは表示されません。');
    }

    // 4. すべてのデータをキャッシュファイルに保存
    const processedData = {
      vanillaMembersCount: vanillaMembers.size,
      chocomintMembersCount: chocomintMembers.size,
      vanillaInviteCount,
      chocomintInviteCount,
      vanillaTopInviterCount: maxVanillaInvites,
      chocomintTopInviterCount: maxChocomintInvites,
      lastUpdated: new Date().toISOString(),
      graphCommonsEmbedUrl: embedUrl
    };
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(processedData, null, 2));
    console.log('--- 初期化処理が正常に完了しました --- ');

  } catch (error) {
    console.error('\n--- 初期化処理中にエラーが発生しました ---');
    console.error(error);
    console.error('--- エラー詳細終わり ---\n');
  }
};

// === サーバー起動 ===
app.get('/api/data', async (req, res) => {
  try {
    const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    res.json(JSON.parse(cachedData));
  } catch (error) {
    res.status(500).json({ message: 'キャッシュデータの読み込みに失敗しました。サーバーを再起動してデータを再生成してください。' });
  }
});

app.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
  // サーバー起動時に一度だけ、初期化処理を実行
  initialize();
});