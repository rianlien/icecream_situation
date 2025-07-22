
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

// Graph Commons 認証情報とグラフID（環境変数から取得）
const GC_USERNAME = process.env.GC_USERNAME;
const GC_PASSWORD = process.env.GC_PASSWORD;
const GC_GRAPH_ID = process.env.GC_GRAPH_ID;
const GRAPHQL_API_URL = 'https://graphcommons.com/graphql';

// CORS設定
app.use(cors({
  origin: '*' // 開発中は一旦すべて許可。本番ではフロントエンドのドメインに限定します。
}));

app.use(express.json()); // JSON形式のリクエストボディをパースするためのミドルウェア

// Graph Commons GraphQL APIにログインし、JWTトークンを取得する関数
// この関数は現在使用されませんが、将来的な拡張のために残しておきます。
const loginGraphCommons = async () => {
  if (!GC_USERNAME || !GC_PASSWORD) {
    throw new Error('Graph Commonsのユーザー名またはパスワードがサーバーの環境変数に設定されていません。');
  }

  const response = await fetch(GRAPHQL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation login($username: ID!, $password: String!) {
        JWT: login(loginOrEmail: $username, password: $password)
      }`,
      variables: {
        username: GC_USERNAME,
        password: GC_PASSWORD,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Graph CommonsログインAPIエラー: ${response.status} - ${response.statusText}`, errorText);
    throw new Error(`Graph Commonsログイン失敗: ${errorText}`);
  }

  const jsonResponse = await response.json();
  if (jsonResponse.errors) {
    console.error('Graph CommonsログインGraphQLエラー:', jsonResponse.errors);
    throw new Error(`Graph CommonsログインGraphQLエラー: ${jsonResponse.errors[0].message}`);
  }
  return jsonResponse.data.JWT;
};

/**
 * PolygonScanの転送履歴データをGraph Commonsの形式に加工する
 * この関数は現在使用されませんが、将来的な拡張のために残しておきます。
 * @param {Array<Object>} transfers - PolygonScan APIから取得した転送履歴の配列
 * @returns {Object} {nodes: Array, edges: Array} Graph Commons形式のデータ
 */
function transformToGraphCommonsFormat(transfers) {
    const nodes = new Map(); // id -> nodeObject
    const edges = [];
    let nodeIdCounter = 1; // Graph CommonsのノードIDは整数を推奨

    transfers.forEach(tx => {
        const fromAddress = tx.from.toLowerCase();
        const toAddress = tx.to.toLowerCase();
        const tokenId = parseInt(tx.tokenID);
        const value = parseFloat(tx.value) / (10**18); // ETH/MATICの標準的なデノミ

        // ノードの作成または取得
        const getOrCreateNode = (address, type = 'unknown') => {
            if (!nodes.has(address)) {
                nodes.set(address, {
                    id: nodeIdCounter++, // 一意の整数ID
                    name: address.substring(0, 6) + '...' + address.substring(address.length - 4), // 短縮表示
                    label: address.substring(0, 6) + '...',
                    class: type, // 'vanilla-member', 'chocomint-member', 'normal-wallet'など
                    data: { address: address } // 元のアドレス情報
                });
            }
            return nodes.get(address);
        };

        const sourceNode = getOrCreateNode(fromAddress, 'normal-wallet');
        const targetNode = getOrCreateNode(toAddress, 'normal-wallet');

        // ノードのタイプを更新（派閥メンバー）
        if (tokenId === 1 && toAddress !== '0x0000000000000000000000000000000000000000') {
            targetNode.class = 'vanilla-member';
        } else if (tokenId === 3 && toAddress !== '0x0000000000000000000000000000000000000000') {
            targetNode.class = 'chocomint-member';
        }
        // 0x000アドレスからの転送（ミント）や0x000への転送（バーン）はノードタイプ設定から除外
        if (sourceNode.data.address === '0x0000000000000000000000000000000000000000') {
             sourceNode.class = 'mint-address';
             sourceNode.name = 'ミント元';
             sourceNode.label = 'ミント元';
        }
        if (targetNode.data.address === '0x0000000000000000000000000000000000000000') {
             targetNode.class = 'burn-address';
             targetNode.name = 'バーン先';
             targetNode.label = 'バーン先';
        }

        // エッジの作成
        edges.push({
            id: tx.hash + '_' + tx.logIndex, // トランザクションハッシュとログインデックスで一意に
            source: sourceNode.id,
            target: targetNode.id,
            label: `ID:${tokenId} (${value}T)`, // トークンIDと転送量
            class: `token-${tokenId}`, // CSSクラス用 (例: token-0, token-1)
            data: {
                tokenId: tokenId,
                value: value,
                hash: tx.hash,
                timestamp: tx.timeStamp
            }
        });
    });

    return { nodes: Array.from(nodes.values()), edges: edges };
}

// Graph Commonsのグラフを更新する関数
// この関数は現在使用されませんが、将来的な拡張のために残しておきます。
const updateGraphCommons = async (graphData) => {
  if (!GC_GRAPH_ID) {
    console.warn('Graph Commons Graph ID is not set. Skipping graph update.');
    return;
  }
  try {
    const jwt = await loginGraphCommons();
    console.log("Graph Commons JWT取得成功");

    // Step 1: Reset the graph
    const resetGraphMutation = `
      mutation resetGraph($graphId: ID!) {
        resetGraph(id: $graphId) {
          graph {
            id
            name
            embedUrl
          }
        }
      }
    `;

    const resetResponse = await fetch(GRAPHQL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
      },
      body: JSON.stringify({
        query: resetGraphMutation,
        variables: {
          graphId: GC_GRAPH_ID,
        },
      }),
    });

    if (!resetResponse.ok) {
      const errorText = await resetResponse.text();
      console.error(`Graph Commons resetGraph APIエラー: ${resetResponse.status} - ${resetResponse.statusText}`, errorText);
      throw new Error(`Graph Commons resetGraph失敗: ${errorText}`);
    }

    const resetData = await resetResponse.json();
    console.log("Graph Commons resetGraphからの応答:", resetData);

    if (resetData.errors) {
      console.error('Graph Commons resetGraph GraphQLエラー:', resetData.errors);
      throw new Error(`Graph Commons resetGraph GraphQLエラー: ${resetData.errors[0].message}`);
    }

    // Step 2: Add nodes
    const createNodeMutation = `
      mutation createNode($graphId: ID!, $node: NodeInput!) {
        createNode(graphId: $graphId, node: $node) {
          node {
            id
            name
          }
        }
      }
    `;

    for (const node of graphData.nodes) {
      const nodeResponse = await fetch(GRAPHQL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`
        },
        body: JSON.stringify({
          query: createNodeMutation,
          variables: {
            graphId: GC_GRAPH_ID,
            node: {
              id: node.id.toString(),
              name: node.name,
              label: node.label,
              class: node.class,
              data: JSON.stringify(node.data)
            }
          }
        })
      });

      if (!nodeResponse.ok) {
        const errorText = await nodeResponse.text();
        console.error(`Graph Commons createNode APIエラー: ${nodeResponse.status} - ${nodeResponse.statusText}`, errorText);
        throw new Error(`Graph Commons createNode失敗: ${errorText}`);
      }
      const nodeData = await nodeResponse.json();
      if (nodeData.errors) {
        console.error('Graph Commons createNode GraphQLエラー:', nodeData.errors);
        throw new Error(`Graph Commons createNode GraphQLエラー: ${nodeData.errors[0].message}`);
      }
    }

    // Step 3: Add edges
    const createEdgeMutation = `
      mutation createEdge($graphId: ID!, $edge: EdgeInput!) {
        createEdge(graphId: $graphId, edge: $edge) {
          edge {
            id
            source { id }
            target { id }
          }
        }
      }
    `;

    for (const edge of graphData.edges) {
      const edgeResponse = await fetch(GRAPHQL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`
        },
        body: JSON.stringify({
          query: createEdgeMutation,
          variables: {
            graphId: GC_GRAPH_ID,
            edge: {
              sourceId: edge.source.toString(),
              targetId: edge.target.toString(),
              label: edge.label,
              class: edge.class,
              data: JSON.stringify(edge.data)
            }
          }
        })
      });

      if (!edgeResponse.ok) {
        const errorText = await edgeResponse.text();
        console.error(`Graph Commons createEdge APIエラー: ${edgeResponse.status} - ${edgeResponse.statusText}`, errorText);
        throw new Error(`Graph Commons createEdge失敗: ${errorText}`);
      }
      const edgeData = await edgeResponse.json();
      if (edgeData.errors) {
        console.error('Graph Commons createEdge GraphQLエラー:', edgeData.errors);
        throw new Error(`Graph Commons createEdge GraphQLエラー: ${edgeData.errors[0].message}`);
      }
    }

    const embedUrl = `https://graphcommons.com/graphs/${GC_GRAPH_ID}/embed`;
    return embedUrl;

  } catch (error) {
    console.error('バックエンドでのGraph Commons操作エラー:', error);
    return null;
  }
};

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

    // Graph Commonsにデータを送信する代わりに、埋め込みURLを直接設定
    if (GC_GRAPH_ID) {
      processedData.graphCommonsEmbedUrl = `https://graphcommons.com/graphs/${GC_GRAPH_ID}`;
      // キャッシュファイルに埋め込みURLも保存
      await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(processedData, null, 2));
      console.log('Graph Commons embed URL cached.');
    } else {
      console.warn('GC_GRAPH_ID is not set in .env. Graph Commons embed URL will not be available.');
    }

    return processedData;

  } catch (error) {
    console.error('Error fetching or processing data:', error);
    return null;
  }
};

// APIエンドポイント: キャッシュされたデータを返す
app.get('/api/data', async (req, res) => {
  try {
    const cachedData = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
    res.json(JSON.parse(cachedData));
  } catch (error) {
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
