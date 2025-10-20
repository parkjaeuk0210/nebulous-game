// 게임 클라이언트
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const gameContainer = document.getElementById('gameContainer');
const playButton = document.getElementById('playButton');
const playerNameInput = document.getElementById('playerName');
const scoreElement = document.getElementById('score');
const leaderboardList = document.getElementById('leaderboardList');

// 캔버스 크기 설정
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// 게임 상태
let ws = null;
let gameState = {
    players: {},
    food: [],
    myId: null
};
let camera = { x: 0, y: 0, zoom: 1 };
let mouse = { x: 0, y: 0 };

// WebSocket 연결
function connectToServer(playerName) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('서버 연결됨');
        ws.send(JSON.stringify({
            type: 'join',
            name: playerName
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch(data.type) {
            case 'init':
                gameState.myId = data.id;
                break;
            case 'state':
                gameState.players = data.players;
                gameState.food = data.food;
                updateLeaderboard(data.leaderboard);
                break;
        }
    };

    ws.onclose = () => {
        console.log('서버 연결 끊김');
        showMenu();
    };

    ws.onerror = (error) => {
        console.error('WebSocket 오류:', error);
    };
}

// 마우스 이벤트
canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;

    if (ws && ws.readyState === WebSocket.OPEN) {
        const worldX = (mouse.x - canvas.width / 2) / camera.zoom + camera.x;
        const worldY = (mouse.y - canvas.height / 2) / camera.zoom + camera.y;

        ws.send(JSON.stringify({
            type: 'move',
            x: worldX,
            y: worldY
        }));
    }
});

// 키보드 이벤트
window.addEventListener('keydown', (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (e.code === 'Space') {
        e.preventDefault();
        ws.send(JSON.stringify({ type: 'split' }));
    } else if (e.key === 'w' || e.key === 'W') {
        ws.send(JSON.stringify({ type: 'eject' }));
    }
});

// 플레이 버튼
playButton.addEventListener('click', () => {
    const name = playerNameInput.value.trim() || 'Anonymous';
    startGame(name);
});

playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const name = playerNameInput.value.trim() || 'Anonymous';
        startGame(name);
    }
});

function startGame(name) {
    menu.style.display = 'none';
    gameContainer.style.display = 'block';
    connectToServer(name);
    requestAnimationFrame(gameLoop);
}

function showMenu() {
    menu.style.display = 'block';
    gameContainer.style.display = 'none';
    if (ws) {
        ws.close();
        ws = null;
    }
}

// 게임 렌더링
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 배경 그리드
    drawGrid();

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // 먹이 그리기
    gameState.food.forEach(food => {
        drawCircle(food.x, food.y, food.radius, food.color);
    });

    // 플레이어 그리기
    Object.values(gameState.players).forEach(player => {
        player.cells.forEach(cell => {
            // 셀 그리기
            drawCircle(cell.x, cell.y, cell.radius, player.color);

            // 테두리
            ctx.beginPath();
            ctx.arc(cell.x, cell.y, cell.radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 3;
            ctx.stroke();

            // 이름 표시
            if (cell.radius > 20) {
                ctx.fillStyle = 'white';
                ctx.font = `bold ${Math.max(12, cell.radius / 3)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(player.name, cell.x, cell.y);
            }
        });
    });

    ctx.restore();

    // 점수 업데이트
    if (gameState.myId && gameState.players[gameState.myId]) {
        const myPlayer = gameState.players[gameState.myId];
        const totalMass = myPlayer.cells.reduce((sum, cell) => sum + Math.PI * cell.radius * cell.radius, 0);
        scoreElement.textContent = `점수: ${Math.round(totalMass)}`;
    }
}

function drawCircle(x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawGrid() {
    const gridSize = 50;
    const startX = Math.floor((-camera.x - canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
    const endX = Math.ceil((-camera.x + canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
    const startY = Math.floor((-camera.y - canvas.height / 2 / camera.zoom) / gridSize) * gridSize;
    const endY = Math.ceil((-camera.y + canvas.height / 2 / camera.zoom) / gridSize) * gridSize;

    ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
    ctx.lineWidth = 1;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    for (let x = startX; x <= endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
    }

    for (let y = startY; y <= endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
    }

    ctx.restore();
}

function updateCamera() {
    if (gameState.myId && gameState.players[gameState.myId]) {
        const myPlayer = gameState.players[gameState.myId];
        if (myPlayer.cells.length > 0) {
            // 모든 셀의 중심으로 카메라 이동
            let totalX = 0, totalY = 0;
            myPlayer.cells.forEach(cell => {
                totalX += cell.x;
                totalY += cell.y;
            });
            const targetX = totalX / myPlayer.cells.length;
            const targetY = totalY / myPlayer.cells.length;

            camera.x += (targetX - camera.x) * 0.1;
            camera.y += (targetY - camera.y) * 0.1;

            // 줌 레벨 조정 (크기에 따라)
            const totalMass = myPlayer.cells.reduce((sum, cell) => sum + Math.PI * cell.radius * cell.radius, 0);
            const targetZoom = Math.max(0.3, Math.min(1, 1000 / Math.sqrt(totalMass)));
            camera.zoom += (targetZoom - camera.zoom) * 0.05;
        }
    }
}

function updateLeaderboard(leaderboard) {
    if (!leaderboard) return;

    leaderboardList.innerHTML = '';
    leaderboard.slice(0, 10).forEach((player, index) => {
        const li = document.createElement('li');
        li.textContent = `${player.name}: ${player.score}`;
        if (player.id === gameState.myId) {
            li.style.color = '#00ffff';
            li.style.fontWeight = 'bold';
        }
        leaderboardList.appendChild(li);
    });
}

// 게임 루프
function gameLoop() {
    updateCamera();
    render();
    requestAnimationFrame(gameLoop);
}
