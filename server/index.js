import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// 정적 파일 제공
app.use(express.static(path.join(__dirname, '../public')));

// 게임 설정
const WORLD_WIDTH = 5000;
const WORLD_HEIGHT = 5000;
const FOOD_COUNT = 1000;
const MAX_CELLS_PER_PLAYER = 16;

// 게임 상태
const gameState = {
    players: {},
    food: []
};

// 먹이 생성
function createFood() {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        radius: 5,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`
    };
}

// 초기 먹이 생성
for (let i = 0; i < FOOD_COUNT; i++) {
    gameState.food.push(createFood());
}

// 랜덤 색상 생성
function getRandomColor() {
    return `hsl(${Math.random() * 360}, 60%, 50%)`;
}

// 거리 계산
function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// 충돌 체크
function checkCollision(cell1, cell2) {
    const dist = distance(cell1.x, cell1.y, cell2.x, cell2.y);
    return dist < Math.max(cell1.radius, cell2.radius);
}

// WebSocket 연결 처리
wss.on('connection', (ws) => {
    let playerId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch(data.type) {
            case 'join':
                playerId = Math.random().toString(36).substr(2, 9);
                gameState.players[playerId] = {
                    id: playerId,
                    name: data.name,
                    color: getRandomColor(),
                    cells: [{
                        x: Math.random() * WORLD_WIDTH,
                        y: Math.random() * WORLD_HEIGHT,
                        radius: 20,
                        vx: 0,
                        vy: 0
                    }],
                    target: { x: 0, y: 0 }
                };

                ws.send(JSON.stringify({
                    type: 'init',
                    id: playerId
                }));
                break;

            case 'move':
                if (playerId && gameState.players[playerId]) {
                    gameState.players[playerId].target = {
                        x: data.x,
                        y: data.y
                    };
                }
                break;

            case 'split':
                if (playerId && gameState.players[playerId]) {
                    splitPlayer(gameState.players[playerId]);
                }
                break;

            case 'eject':
                if (playerId && gameState.players[playerId]) {
                    ejectMass(gameState.players[playerId]);
                }
                break;
        }
    });

    ws.on('close', () => {
        if (playerId && gameState.players[playerId]) {
            delete gameState.players[playerId];
        }
    });
});

// 플레이어 분열
function splitPlayer(player) {
    if (player.cells.length >= MAX_CELLS_PER_PLAYER) return;

    const newCells = [];
    player.cells.forEach(cell => {
        if (cell.radius > 20) {
            const newRadius = cell.radius / Math.sqrt(2);
            const angle = Math.atan2(player.target.y - cell.y, player.target.x - cell.x);
            const speed = 20;

            newCells.push({
                x: cell.x,
                y: cell.y,
                radius: newRadius,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed
            });

            cell.radius = newRadius;
            cell.vx = -Math.cos(angle) * speed / 2;
            cell.vy = -Math.sin(angle) * speed / 2;
        }
    });

    player.cells.push(...newCells);
}

// 질량 방출
function ejectMass(player) {
    player.cells.forEach(cell => {
        if (cell.radius > 15) {
            const angle = Math.atan2(player.target.y - cell.y, player.target.x - cell.x);
            const speed = 30;

            gameState.food.push({
                id: Math.random().toString(36).substr(2, 9),
                x: cell.x + Math.cos(angle) * cell.radius,
                y: cell.y + Math.sin(angle) * cell.radius,
                radius: 8,
                color: player.color,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed
            });

            // 질량 감소
            const newMass = Math.PI * cell.radius * cell.radius - Math.PI * 64;
            cell.radius = Math.sqrt(newMass / Math.PI);
        }
    });
}

// 게임 업데이트
function updateGame() {
    // 플레이어 이동
    Object.values(gameState.players).forEach(player => {
        player.cells.forEach(cell => {
            // 타겟 방향으로 이동
            const dx = player.target.x - cell.x;
            const dy = player.target.y - cell.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 1) {
                const speed = Math.max(2.5, 5 - cell.radius / 10);
                cell.vx += (dx / dist) * speed * 0.1;
                cell.vy += (dy / dist) * speed * 0.1;
            }

            // 마찰
            cell.vx *= 0.9;
            cell.vy *= 0.9;

            // 위치 업데이트
            cell.x += cell.vx;
            cell.y += cell.vy;

            // 월드 경계
            cell.x = Math.max(cell.radius, Math.min(WORLD_WIDTH - cell.radius, cell.x));
            cell.y = Math.max(cell.radius, Math.min(WORLD_HEIGHT - cell.radius, cell.y));
        });
    });

    // 먹이 이동
    gameState.food.forEach(food => {
        if (food.vx !== undefined) {
            food.vx *= 0.95;
            food.vy *= 0.95;
            food.x += food.vx;
            food.y += food.vy;

            food.x = Math.max(0, Math.min(WORLD_WIDTH, food.x));
            food.y = Math.max(0, Math.min(WORLD_HEIGHT, food.y));
        }
    });

    // 먹이 먹기
    Object.values(gameState.players).forEach(player => {
        player.cells.forEach(cell => {
            gameState.food = gameState.food.filter(food => {
                if (checkCollision(cell, food)) {
                    const foodMass = Math.PI * food.radius * food.radius;
                    const cellMass = Math.PI * cell.radius * cell.radius;
                    cell.radius = Math.sqrt((cellMass + foodMass) / Math.PI);
                    return false;
                }
                return true;
            });
        });
    });

    // 플레이어 간 충돌
    const players = Object.values(gameState.players);
    for (let i = 0; i < players.length; i++) {
        for (let j = 0; j < players.length; j++) {
            if (i === j) continue;

            const p1 = players[i];
            const p2 = players[j];

            for (let ci = p1.cells.length - 1; ci >= 0; ci--) {
                for (let cj = p2.cells.length - 1; cj >= 0; cj--) {
                    const c1 = p1.cells[ci];
                    const c2 = p2.cells[cj];

                    if (checkCollision(c1, c2)) {
                        if (c1.radius > c2.radius * 1.1) {
                            const mass1 = Math.PI * c1.radius * c1.radius;
                            const mass2 = Math.PI * c2.radius * c2.radius;
                            c1.radius = Math.sqrt((mass1 + mass2) / Math.PI);
                            p2.cells.splice(cj, 1);
                        } else if (c2.radius > c1.radius * 1.1) {
                            const mass1 = Math.PI * c1.radius * c1.radius;
                            const mass2 = Math.PI * c2.radius * c2.radius;
                            c2.radius = Math.sqrt((mass1 + mass2) / Math.PI);
                            p1.cells.splice(ci, 1);
                            break;
                        }
                    }
                }
            }
        }
    }

    // 죽은 플레이어 제거
    Object.keys(gameState.players).forEach(id => {
        if (gameState.players[id].cells.length === 0) {
            delete gameState.players[id];
        }
    });

    // 먹이 보충
    while (gameState.food.length < FOOD_COUNT) {
        gameState.food.push(createFood());
    }

    // 셀 병합 (시간이 지나면)
    Object.values(gameState.players).forEach(player => {
        if (player.cells.length > 1) {
            for (let i = 0; i < player.cells.length; i++) {
                for (let j = i + 1; j < player.cells.length; j++) {
                    const c1 = player.cells[i];
                    const c2 = player.cells[j];
                    const dist = distance(c1.x, c1.y, c2.x, c2.y);

                    if (dist < c1.radius + c2.radius && Math.random() < 0.01) {
                        const mass1 = Math.PI * c1.radius * c1.radius;
                        const mass2 = Math.PI * c2.radius * c2.radius;
                        c1.radius = Math.sqrt((mass1 + mass2) / Math.PI);
                        c1.x = (c1.x * mass1 + c2.x * mass2) / (mass1 + mass2);
                        c1.y = (c1.y * mass1 + c2.y * mass2) / (mass1 + mass2);
                        player.cells.splice(j, 1);
                        break;
                    }
                }
            }
        }
    });
}

// 상태 브로드캐스트
function broadcastState() {
    const leaderboard = Object.values(gameState.players)
        .map(p => ({
            id: p.id,
            name: p.name,
            score: Math.round(p.cells.reduce((sum, cell) => sum + Math.PI * cell.radius * cell.radius, 0))
        }))
        .sort((a, b) => b.score - a.score);

    const state = {
        type: 'state',
        players: gameState.players,
        food: gameState.food,
        leaderboard: leaderboard
    };

    wss.clients.forEach(client => {
        if (client.readyState === 1) {
            client.send(JSON.stringify(state));
        }
    });
}

// 게임 루프
setInterval(() => {
    updateGame();
    broadcastState();
}, 1000 / 30); // 30 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
});
