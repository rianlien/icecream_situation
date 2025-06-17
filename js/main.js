//
// main.js
// PolygonScanなどからデータを取得し、HTMLに反映させるロジックをここに記述します。
//
// トークンコントラクトアドレス
const TOKEN_CONTRACT_ADDRESS = '0xd73140ee4b85d9a7797573692ef97c7d3d0cd776';

// PolygonScan APIキー（ご自身のAPIキーに置き換えてください）
// ⚠️ 注意: クライアントサイドでのAPIキーの直接記述はセキュリティリスクがあるため、
// 本番運用ではバックエンド経由でAPIを呼び出すことを強く推奨します。
// 今回はローカル環境での開発のため、このままで進めます。
//const POLYGONSCAN_API_KEY = 'AK4HC4VZ8524VSQIVBVNM581Q212VRBTJY'; // ここにAPIキーを設定してください

// メッセージ表示用の要素を作成（alertの代わり）
function showMessage(message) {
    let messageBox = document.getElementById('custom-message-box');
    if (!messageBox) {
        messageBox = document.createElement('div');
        messageBox.id = 'custom-message-box';
        messageBox.className = 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-800 text-white p-6 rounded-lg shadow-xl z-50 text-center opacity-0 transition-opacity duration-300';
        messageBox.innerHTML = `
            <p id="message-content" class="text-xl mb-4"></p>
            <button class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-full">OK</button>
        `;
        document.body.appendChild(messageBox);

        messageBox.querySelector('button').addEventListener('click', () => {
            messageBox.classList.add('opacity-0');
            setTimeout(() => messageBox.remove(), 300); // アニメーション後に削除
        });
    }
    messageBox.querySelector('#message-content').innerText = message;
    messageBox.classList.remove('opacity-0');
}


// ローディング状態を設定する関数
function setLoading(isLoading) {
    const elements = ['vanilla-members-count', 'chocomint-members-count', 'vanilla-invite-count', 'chocomint-invite-count', 'vanilla-top-inviter-count', 'chocomint-top-inviter-count', 'vanilla-progress-text', 'chocomint-progress-text', 'current-goal-display', 'milestone-percentage-display'];
    elements.forEach(id => {
        const el = document.getElementById(id);
        if (el) { // 要素が存在する場合のみ処理
            if (isLoading) {
                // カウント表示要素は---に戻す
                if (['vanilla-members-count', 'chocomint-members-count', 'vanilla-invite-count', 'chocomint-invite-count', 'vanilla-top-inviter-count', 'chocomint-top-inviter-count'].includes(id)) {
                     el.innerHTML = '---';
                } else if (id === 'current-goal-display') {
                    el.innerText = '--- / ---';
                } else if (id === 'milestone-percentage-display') {
                    el.innerText = '---%';
                } else {
                    el.innerText = 'Loading...';
                }
                el.classList.add('text-gray-400'); // ローディング中の色
            } else {
                el.classList.remove('text-gray-400');
            }
        }
    });
}

// データを取得して表示する関数
async function fetchDataAndDisplay() {
    console.log("Fetching data...");
    setLoading(true); // ローディング表示を開始

    // config.jsで定義されたPOLYGONSCAN_API_KEYを使用
    // config.jsがmain.jsより先に読み込まれることを前提とします
    if (typeof POLYGONSCAN_API_KEY === 'undefined' || POLYGONSCAN_API_KEY === 'YOUR_POLYGONSCAN_API_KEY') {
        showMessage('エラー: PolygonScan APIキーが設定されていません。js/config.jsを確認してください。');
        setLoading(false);
        return; // APIキーがない場合は処理を中断
    }

    try {
        const url = `https://api.polygonscan.com/api?module=account&action=tokennfttx&contractaddress=${TOKEN_CONTRACT_ADDRESS}&page=1&offset=10000&sort=asc&apikey=${POLYGONSCAN_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === '1' && data.message === 'OK') {
            const transfers = data.result;

            // 各カウンターの初期化
            let vanillaMembers = new Set(); // ID: 1 の保有者（重複なし）
            let chocomintMembers = new Set(); // ID: 3 の保有者（重複なし）
            let vanillaInviteCount = 0; // ID: 0 の転送数
            let chocomintInviteCount = 0; // ID: 2 の転送数

            let vanillaInviterCounts = new Map(); // バニラ派の招待者ごとのカウント
            let chocomintInviterCounts = new Map(); // チョコミント派の招待者ごとのカウント

            // イベントログを解析してカウント
            transfers.forEach(tx => {
                const tokenId = parseInt(tx.tokenID);
                const fromAddress = tx.from.toLowerCase();
                const toAddress = tx.to.toLowerCase();

                // TokenID 1 はバニラ派宣言、TokenID 3 はチョコミント派宣言
                if (tokenId === 1 && toAddress !== '0x0000000000000000000000000000000000000000') {
                    vanillaMembers.add(toAddress);
                } else if (tokenId === 3 && toAddress !== '0x0000000000000000000000000000000000000000') {
                    chocomintMembers.add(toAddress);
                }

                // TokenID 0 はバニラ派の招待用、TokenID 2 はチョコミント派の招待用
                if (tokenId === 0 && fromAddress !== '0x0000000000000000000000000000000000000000') {
                    vanillaInviteCount++;
                    vanillaInviterCounts.set(fromAddress, (vanillaInviterCounts.get(fromAddress) || 0) + 1);
                } else if (tokenId === 2 && fromAddress !== '0x0000000000000000000000000000000000000000') {
                    chocomintInviteCount++;
                    chocomintInviterCounts.set(fromAddress, (chocomintInviterCounts.get(fromAddress) || 0) + 1);
                }
            });

            // 一番招待を出しているユーザーの招待数を取得
            const maxVanillaInvites = vanillaInviterCounts.size > 0 ? Math.max(...vanillaInviterCounts.values()) : 0;
            const maxChocomintInvites = chocomintInviterCounts.size > 0 ? Math.max(...chocomintInviterCounts.values()) : 0;

            // HTML要素を更新
            document.getElementById('vanilla-members-count').innerHTML = vanillaMembers.size + '<span class="text-4xl">人</span>';
            document.getElementById('chocomint-members-count').innerHTML = chocomintMembers.size + '<span class="text-4xl">人</span>';
            document.getElementById('vanilla-invite-count').innerHTML = vanillaInviteCount + '<span class="text-4xl">回</span>';
            document.getElementById('chocomint-invite-count').innerHTML = chocomintInviteCount + '<span class="text-4xl">回</span>';
            document.getElementById('vanilla-top-inviter-count').innerHTML = maxVanillaInvites + '<span class="text-2xl">回</span> <span class="text-lg text-gray-500">招待済み</span>';
            document.getElementById('chocomint-top-inviter-count').innerHTML = maxChocomintInvites + '<span class="text-2xl">回</span> <span class="text-lg text-gray-500">招待済み</span>';


            // 派閥バトル進捗バーの更新
            const totalMembers = vanillaMembers.size + chocomintMembers.size;
            const vanillaPercentage = totalMembers > 0 ? (vanillaMembers.size / totalMembers) * 100 : 50;
            const chocomintPercentage = 100 - vanillaPercentage; // 常に合計100%になるように

            document.getElementById('vanilla-progress-bar').style.width = `${vanillaPercentage}%`;
            document.getElementById('chocomint-progress-bar').style.width = `${chocomintPercentage}%`;

            document.getElementById('vanilla-progress-text').innerText = `${vanillaMembers.size}人`;
            document.getElementById('chocomint-progress-text').innerText = `${chocomintMembers.size}人`;


            // マイルストーンの更新
            const totalInviteActions = vanillaInviteCount + chocomintInviteCount;
            const milestoneGoal = 500;
            const milestoneTitle = document.getElementById('milestone-title');
            const milestoneMessageContainer = document.getElementById('milestone-message-container');
            const milestoneProgressCircle = document.getElementById('milestone-progress-circle');
            const currentGoalDisplay = document.getElementById('current-goal-display');
            const milestonePercentageDisplay = document.getElementById('milestone-percentage-display');


            // 目標と現在の合計招待数を円形バーとメッセージに反映
            const milestoneProgress = Math.min(100, (totalInviteActions / milestoneGoal) * 100);

            // 円形バーのテキストを更新
            currentGoalDisplay.innerText = `${totalInviteActions} / ${milestoneGoal}`;
            milestonePercentageDisplay.innerText = `${Math.floor(milestoneProgress)}%`;

            if (totalInviteActions >= milestoneGoal) {
                milestoneTitle.innerText = '🎉 コミュニティ目標達成！ 🎉';
                milestoneMessageContainer.innerHTML = `
                    招待アクションの合計が <span class="font-bold text-4xl text-purple-800">${milestoneGoal}回</span> に到達しました！<br>
                    みんなの協力に感謝！特別なサプライズがあるかも！？
                `;
                milestoneProgressCircle.classList.add('achieved'); // 達成時の色に変更
                milestonePercentageDisplay.innerText = '達成！'; // 円形バーのパーセンテージを「達成！」に
            } else {
                milestoneTitle.innerText = '🎉 コミュニティ目標 🎉';
                milestoneMessageContainer.innerHTML = `
                    招待アクションの合計が <span class="font-bold text-4xl text-purple-800">${milestoneGoal}回</span> に到達すると、何か素敵なおまけが！？<br>
                    みんなで力を合わせて達成しよう！
                `;
                milestoneProgressCircle.classList.remove('achieved'); // 達成時の色を解除
            }

            // 円形進捗バーのグラデーションを更新
            const progressColor = milestoneProgressCircle.classList.contains('achieved') ? '#22c55e' : '#a855f7'; // green-500 or purple-500
            milestoneProgressCircle.style.background = `conic-gradient(${progressColor} 0% ${milestoneProgress}%, #d1d5db ${milestoneProgress}% 100%)`;


        } else {
            console.error('Error fetching data from PolygonScan:', data.message);
            showMessage('データの取得に失敗しました。APIキーを確認してください。');
        }
    } catch (error) {
        console.error('Network or parsing error:', error);
        showMessage('ネットワークエラーまたはデータの解析に失敗しました。');
    } finally {
        setLoading(false); // ローディング表示を終了
    }
}

// ページの読み込みが完了したらデータを取得して表示
window.onload = () => {
    fetchDataAndDisplay();

    // ボタンのクリックイベントリスナー
    document.getElementById('join-vanilla-button').addEventListener('click', () => {
        showMessage('バニラチョコ派に入るボタンがクリックされました！\n(この機能はまだ実装されていません)');
        // TODO: ここにバニラチョコ派に入るためのWeb3ロジック（例: ウォレット接続、トランザクション送信）を実装
    });

    document.getElementById('join-chocomint-button').addEventListener('click', () => {
        showMessage('チョコミント派に入るボタンがクリックされました！\n(この機能はまだ実装されていません)');
        // TODO: ここにチョコミント派に入るためのWeb3ロジック（例: ウォレット接続、トランザクション送信）を実装
    });
};
