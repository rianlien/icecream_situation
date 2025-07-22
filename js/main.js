// js/main.js

// バックエンドサーバーのエンドポイント
const BACKEND_API_URL = 'http://localhost:3000/api/data';

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
                if ([ 'vanilla-members-count', 'chocomint-members-count', 'vanilla-invite-count', 'chocomint-invite-count', 'vanilla-top-inviter-count', 'chocomint-top-inviter-count'].includes(id)) {
                     el.innerHTML = '---';
                } else if (id === 'current-goal-display') {
                    el.innerText = '--- / ---';
                } else if (id === 'milestone-percentage-display') {
                    el.innerText = '---%';
                } else {
                    el.innerText = 'Loading...';
                }
                el.classList.add('text-gray-400');
            } else {
                el.classList.remove('text-gray-400');
            }
        }
    });
}

// データを取得して画面に表示する関数
async function fetchDataAndDisplay() {
    console.log("Fetching data from backend...");
    setLoading(true);

    try {
        const response = await fetch(BACKEND_API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // HTML要素を更新
        document.getElementById('vanilla-members-count').innerHTML = data.vanillaMembersCount + '<span class="text-4xl">人</span>';
        document.getElementById('chocomint-members-count').innerHTML = data.chocomintMembersCount + '<span class="text-4xl">人</span>';
        document.getElementById('vanilla-invite-count').innerHTML = data.vanillaInviteCount + '<span class="text-4xl">回</span>';
        document.getElementById('chocomint-invite-count').innerHTML = data.chocomintInviteCount + '<span class="text-4xl">回</span>';
        document.getElementById('vanilla-top-inviter-count').innerHTML = data.vanillaTopInviterCount + '<span class="text-2xl">回</span> <span class="text-lg text-gray-500">招待済み</span>';
        document.getElementById('chocomint-top-inviter-count').innerHTML = data.chocomintTopInviterCount + '<span class="text-2xl">回</span> <span class="text-lg text-gray-500">招待済み</span>';

        // 派閥バトル進捗バーの更新
        const totalMembers = data.vanillaMembersCount + data.chocomintMembersCount;
        const vanillaPercentage = totalMembers > 0 ? (data.vanillaMembersCount / totalMembers) * 100 : 50;
        const chocomintPercentage = 100 - vanillaPercentage;

        document.getElementById('vanilla-progress-bar').style.width = `${vanillaPercentage}%`;
        document.getElementById('chocomint-progress-bar').style.width = `${chocomintPercentage}%`;
        document.getElementById('vanilla-progress-text').innerText = `${data.vanillaMembersCount}人`;
        document.getElementById('chocomint-progress-text').innerText = `${data.chocomintMembersCount}人`;

        // マイルストーンの更新
        const totalInviteActions = data.vanillaInviteCount + data.chocomintInviteCount;
        const milestoneGoal = 1000; // 目標値はフロントで保持
        const milestoneTitle = document.getElementById('milestone-title');
        const milestoneMessageContainer = document.getElementById('milestone-message-container');
        const milestoneProgressCircle = document.getElementById('milestone-progress-circle');
        const currentGoalDisplay = document.getElementById('current-goal-display');
        const milestonePercentageDisplay = document.getElementById('milestone-percentage-display');

        const milestoneProgress = Math.min(100, (totalInviteActions / milestoneGoal) * 100);

        currentGoalDisplay.innerText = `${totalInviteActions} / ${milestoneGoal}`;
        milestonePercentageDisplay.innerText = `${Math.floor(milestoneProgress)}%`;

        if (totalInviteActions >= milestoneGoal) {
            milestoneTitle.innerText = '🎉 コミュニティ目標達成！ 🎉';
            milestoneMessageContainer.innerHTML = `招待アクションの合計が <span class="font-bold text-4xl text-purple-800">${milestoneGoal}回</span> に到達しました！<br>みんなの協力に感謝！特別なサプライズがあるかも！？`;
            milestoneProgressCircle.classList.add('achieved');
            milestonePercentageDisplay.innerText = '達成！';
        } else {
            milestoneTitle.innerText = '🎉 コミュニティ目標 🎉';
            milestoneMessageContainer.innerHTML = `招待アクションの合計が <span class="font-bold text-4xl text-purple-800">${milestoneGoal}回</span> に到達すると、何か素敵なおまけが！？<br>みんなで力を合わせて達成しよう！`;
            milestoneProgressCircle.classList.remove('achieved');
        }

        const progressColor = milestoneProgressCircle.classList.contains('achieved') ? '#22c55e' : '#a855f7';
        milestoneProgressCircle.style.background = `conic-gradient(${progressColor} 0% ${milestoneProgress}%, #d1d5db ${milestoneProgress}% 100%)`;

    } catch (error) {
        console.error('Error fetching data from backend:', error);
        showMessage('データの取得に失敗しました。バックエンドサーバーが起動しているか確認してください。');
    } finally {
        setLoading(false);
    }
}

// ページの読み込みが完了したらデータを取得して表示
window.onload = () => {
    fetchDataAndDisplay();

    // ボタンのクリックイベントリスナー
    document.getElementById('join-vanilla-button').addEventListener('click', () => {
        showMessage('バニラチョコ派に入るボタンがクリックされました！\n(この機能はまだ実装されていません)');
    });

    document.getElementById('join-chocomint-button').addEventListener('click', () => {
        showMessage('チョコミント派に入るボタンがクリックされました！\n(この機能はまだ実装されていません)');
    });

    // 3分ごとにデータを自動更新
    setInterval(fetchDataAndDisplay, 180000); // 180000ミリ秒 = 3分
};
