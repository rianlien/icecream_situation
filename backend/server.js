// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const TOKEN_CONTRACT_ADDRESS = '0xd73140ee4b85d9a7797573692ef97c7d3d0cd776';
//const TOKEN_CONTRACT_ADDRESS = '0x144219C8074E895E666e5C36b71AC7D37443CcDe';
const CACHE_FILE_PATH = path.join(__dirname, 'data.json');
const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1時間

app.use(cors({ origin: '*' }));
app.use(express.json());

// PolygonScanからデータを取得し、加工してファイルに保存するメイン関数
const fetchAndCacheData = async () => {
  console.log(`[${new Date().toISOString()}] --- データ更新処理を開始 ---`);
  try {
    console.log('  -> Alchemyから最新データを取得します。');
    if (!ALCHEMY_API_KEY) throw new Error('ALCHEMY_API_KEYが設定されていません。');
    const ALCHEMY_API_URL = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
    const response = await fetch(ALCHEMY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getAssetTransfers',
        params: [
          {
            fromBlock: "0x0",
            toBlock: "latest",
            contractAddresses: [TOKEN_CONTRACT_ADDRESS],
            category: ["erc721"],
            withMetadata: false,
            excludeZeroValue: true,
            maxCount: "0x3e8" // 1000 in hex
          },
        ],
      }),
    });
    const data = await response.json();
    if (!data.result || !data.result.transfers) throw new Error(`Alchemyからのデータ取得失敗: ${JSON.stringify(data.error || data)}`);
    const transfers = data.result.transfers.map(t => ({
      from: t.from,
      to: t.to,
      tokenID: parseInt(t.tokenId, 16), // AlchemyのtokenIdは16進数なので変換
    }));
    console.log(`     ${transfers.length}件のトランザクションを取得しました。`);

    console.log('  -> フロントエンド用のデータを集計・加工中...');
    let vanillaMembers = new Set();
    let chocomintMembers = new Set();
    let vanillaInviteCount = 0;
    let chocomintInviteCount = 0;
    let vanillaInviterCounts = new Map();
    let chocomintInviterCounts = new Map();

    transfers.forEach(t => {
      const tokenId = t.tokenID;
      const fromAddress = t.from.toLowerCase();
      const toAddress = t.to.toLowerCase();

      if (tokenId === 1) vanillaMembers.add(toAddress);
      else if (tokenId === 3) chocomintMembers.add(toAddress);

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

    // すべてのユニークなアドレスを抽出
    const allAddresses = Array.from(new Set([
        ...transfers.map(t => t.from.toLowerCase().startsWith('0x5b479e186a10d25d') ? '0x0000000000000000000000000000000000000000' : t.from),
        ...transfers.map(t => t.to.toLowerCase().startsWith('0x5b479e186a10d25d') ? '0x0000000000000000000000000000000000000000' : t.to)
    ]));

    // リンクデータを生成 (自己ループは除外)
    const links = transfers.filter(t => t.from !== t.to).map(t => {
        let sourceAddress = t.from;
        // 0x5b479e186a10d25dから始まるノードのリンク元を0x0000000000000000000000000000000000000000に書き換える
        if (sourceAddress.toLowerCase().startsWith('0x5b479e186a10d25d')) {
            sourceAddress = '0x0000000000000000000000000000000000000000';
        }
        return {
            source: sourceAddress,
            target: t.to,
            value: 1,
            tokenId: parseInt(t.tokenID)
        };
    });

    // 各ノードの接続数を計算
    const connectionCounts = allAddresses.reduce((acc, address) => {
        acc[address] = 0;
        return acc;
    }, {});

    links.forEach(link => {
        connectionCounts[link.source] = (connectionCounts[link.source] || 0) + 1;
        connectionCounts[link.target] = (connectionCounts[link.target] || 0) + 1;
    });

    const processedData = {
      vanillaMembersCount: vanillaMembers.size,
      chocomintMembersCount: chocomintMembers.size,
      vanillaInviteCount,
      chocomintInviteCount,
      vanillaTopInviterCount: maxVanillaInvites,
      chocomintTopInviterCount: maxChocomintInvites,
      lastUpdated: new Date().toISOString(),
      network: {
          nodes: allAddresses.map(address => {
              let type = 'normal-wallet';
              if (address === '0x0000000000000000000000000000000000000000') type = 'mint-address';
              else if (vanillaMembers.has(address)) type = 'vanilla-member';
              else if (chocomintMembers.has(address)) type = 'chocomint-member';
              return { 
                  id: address, 
                  type: type,
                  connectionCount: connectionCounts[address] || 0 // 確実に数値が入る
              };
          }),
          links: links
      }
    };

    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(processedData, null, 2));
    console.log(`  -> キャッシュファイル (${CACHE_FILE_PATH}) を正常に更新しました。`);

  } catch (error) {
    console.error(`[${new Date().toISOString()}] --- データ更新処理中にエラーが発生しました ---`);
    console.error(error);
  }
};

// === APIエンドポイント ===
app.get('/api/data', async (req, res) => {
  try {
    const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    console.log(`[${new Date().toISOString()}] APIリクエスト受信。キャッシュからデータを返します。`);
    res.json(JSON.parse(cachedData));
  } catch (error) {
    console.error(`[${new Date().toISOString()}] APIリクエスト受信。キャッシュファイルが見つかりません。`, error);
    res.status(503).json({ message: 'サービス準備中です。しばらくしてから再度お試しください。' });
  }
});

// === サーバー起動と定期更新 ===
app.listen(port, () => {
  console.log(`Backend server is running on http://localhost:${port}`);
  
  // サーバー起動時にまず一度、データを取得してキャッシュを作成
  fetchAndCacheData();

  // その後、1時間ごとにバックグラウンドでキャッシュを更新
  setInterval(fetchAndCacheData, UPDATE_INTERVAL_MS);
});