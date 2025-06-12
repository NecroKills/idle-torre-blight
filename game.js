const gameArea = document.getElementById("game");
const goldDisplay = document.getElementById("gold");
const waveDisplay = document.getElementById("wave");
const damageDisplay = document.getElementById("damage");
const castleHpText = document.getElementById("castleHpText");
const castleHpBarInner = document.querySelector("#castleHpBar > div");
const raidLevelDisplay = document.getElementById("raidLevel");
const nextRaidBtn = document.getElementById("nextRaidBtn");
const diamondsDisplay = document.getElementById("diamonds");

// Estado inicial
let gold = parseInt(localStorage.getItem("gold")) || 0;
let wave = 0; // Não usaremos mais o sistema de ondas
let towerDamage = parseInt(localStorage.getItem("towerDamage")) || 10;
let raidLevel = parseInt(localStorage.getItem("raidLevel")) || 1;
let diamonds = parseInt(localStorage.getItem("diamonds")) || 0;

goldDisplay.textContent = gold;
waveDisplay.textContent = wave;
damageDisplay.textContent = towerDamage;
raidLevelDisplay.textContent = raidLevel;
diamondsDisplay.textContent = diamonds;

// RAID CONFIG
const RAID_DURATION = 300; // 5 minutos em segundos
let raidTime = 0;
let raidInterval = null;
let activeRifts = 1; // Começa com 1 fenda
let bossSpawned = false;
let raidEnded = false;

// Castelo
let castleMaxHp = 100;
let castleHp = castleMaxHp;

function updateCastleHp() {
  castleHpText.textContent = castleHp;
  const perc = Math.max(0, (castleHp / castleMaxHp) * 100);
  castleHpBarInner.style.width = perc + "%";
  if (castleHp <= 0 && !raidEnded) {
    raidEnded = true;
    showNextRaidBtn();
    alert("Game Over! O castelo foi destruído!");
    location.reload();
  }
}
updateCastleHp();

// Novo centro
const centerX = 600;
const centerY = 300;

// --- Caminhos Dinâmicos ---
const pathsCanvas = document.getElementById("pathsCanvas");
const ctx = pathsCanvas.getContext("2d");

let allPaths = [];
let allBuildSpots = [];
let activePath = null;

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function generateRandomPath(start, end, minSegments = 5, maxSegments = 8) {
  // Gera um caminho "torto" de start até a borda do castelo
  const waypoints = [start];
  let prev = start;
  let last = start;
  for (let i = 1; i < minSegments + Math.floor(Math.random() * (maxSegments-minSegments+1)); i++) {
    const t = i / (minSegments + 1);
    const x = prev.x + (end.x - prev.x) * t + randomBetween(-120, 120);
    const y = prev.y + (end.y - prev.y) * t + randomBetween(-80, 80);
    waypoints.push({x, y});
    prev = {x, y};
    last = prev;
  }
  // Calcular ponto final na borda do castelo
  const dx = end.x - last.x;
  const dy = end.y - last.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const castleRadius = 30; // metade do tamanho do castelo
  const finalX = end.x - (dx/dist) * castleRadius;
  const finalY = end.y - (dy/dist) * castleRadius;
  waypoints.push({x: finalX, y: finalY});
  return waypoints;
}

function generateBuildSpotsForPath(path) {
  const spots = [];
  const numSpots = 6 + Math.floor(Math.random() * 4); // 6 a 9 pontos por caminho
  // Chance de cluster
  if (Math.random() < 0.5) {
    // Criar cluster
    const clusterIdx = 1 + Math.floor(Math.random() * (path.length - 3));
    const clusterCount = 3 + Math.floor(Math.random() * 2); // 3 ou 4
    for (let i = 0; i < clusterCount; i++) {
      const base = path[clusterIdx];
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 20;
      spots.push({
        x: base.x + Math.cos(angle) * dist,
        y: base.y + Math.sin(angle) * dist
      });
    }
    // Restante dos pontos distribuídos
    for (let i = clusterCount; i < numSpots; i++) {
      const segIdx = 1 + Math.floor(Math.random() * (path.length - 2));
      const base = path[segIdx];
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 30;
      spots.push({
        x: base.x + Math.cos(angle) * dist,
        y: base.y + Math.sin(angle) * dist
      });
    }
  } else {
    // Todos distribuídos aleatoriamente
    for (let i = 0; i < numSpots; i++) {
      const segIdx = 1 + Math.floor(Math.random() * (path.length - 2));
      const base = path[segIdx];
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 30;
      spots.push({
        x: base.x + Math.cos(angle) * dist,
        y: base.y + Math.sin(angle) * dist
      });
    }
  }
  return spots;
}

function drawPaths() {
  ctx.clearRect(0, 0, pathsCanvas.width, pathsCanvas.height);
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#8B5A2B"; // cor de terra
  ctx.lineCap = "round";
  for (const path of allPaths) {
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
  }
  // Desenhar pontos de construção
  ctx.fillStyle = "#fff";
  for (const spots of allBuildSpots) {
    for (const spot of spots) {
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#bbb";
      ctx.stroke();
    }
  }
}

function addBuildSpotsToExistingPaths() {
  for (let i = 0; i < allPaths.length - 1; i++) { // exceto o novo
    const path = allPaths[i];
    const spots = allBuildSpots[i];
    const addCount = 1 + Math.floor(Math.random() * 3); // 1 a 3
    for (let j = 0; j < addCount; j++) {
      const segIdx = 1 + Math.floor(Math.random() * (path.length - 2));
      const base = path[segIdx];
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 30;
      spots.push({
        x: base.x + Math.cos(angle) * dist,
        y: base.y + Math.sin(angle) * dist
      });
    }
  }
}

function createNewPathOrBranch() {
  // Decide se cria novo caminho ou ramifica
  const center = {x: centerX, y: centerY};
  let start;
  if (allPaths.length === 0 || Math.random() < 0.5) {
    // Novo caminho: escolhe borda aleatória
    const side = Math.floor(Math.random()*4);
    if (side === 0) start = {x: randomBetween(0, 1200), y: 0}; // topo
    if (side === 1) start = {x: randomBetween(0, 1200), y: 600}; // baixo
    if (side === 2) start = {x: 0, y: randomBetween(0, 600)}; // esquerda
    if (side === 3) start = {x: 1200, y: randomBetween(0, 600)}; // direita
    const path = generateRandomPath(start, center);
    allPaths.push(path);
    activePath = path;
    allBuildSpots.push(generateBuildSpotsForPath(path));
  } else {
    // Ramifica de um ponto aleatório de um caminho existente
    const basePath = allPaths[Math.floor(Math.random()*allPaths.length)];
    const branchIdx = Math.floor(randomBetween(1, basePath.length-2));
    start = basePath[branchIdx];
    const path = generateRandomPath(start, {x: centerX, y: centerY});
    allPaths.push(path);
    activePath = path;
    allBuildSpots.push(generateBuildSpotsForPath(path));
  }
  addBuildSpotsToExistingPaths();
  drawPaths();
}

// Atualizar posições das torres para proteger as novas fendas
const towers = [
  { x: 600, y: 180, range: 180, path: 0 },  // norte
  { x: 600, y: 420, range: 180, path: 1 },   // sul
  { x: 900, y: 300, range: 180, path: 2 },  // leste
  { x: 300, y: 300, range: 180, path: 3 },   // oeste
  { x: 900, y: 180, range: 180, path: 4 }    // nordeste
];

// Criar elemento torre visual
function spawnTower(tower) {
  const el = document.createElement("div");
  el.className = "tower";
  el.style.left = tower.x + "px";
  el.style.top = tower.y + "px";
  gameArea.appendChild(el);
}
towers.forEach(spawnTower);

// Lista de inimigos vivos
const enemies = [];

// Função para mover inimigos entre waypoints do seu caminho
function moveAlongPath(enemy) {
  const path = enemy.path;
  if (enemy.currentTargetIndex === undefined) enemy.currentTargetIndex = 1;
  const target = path[enemy.currentTargetIndex];
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < enemy.speed) {
    enemy.x = target.x;
    enemy.y = target.y;
    enemy.currentTargetIndex++;
    if (enemy.currentTargetIndex >= path.length) {
      enemyReachedCastle(enemy);
      return;
    }
  } else {
    enemy.x += (dx / dist) * enemy.speed;
    enemy.y += (dy / dist) * enemy.speed;
  }
  enemy.element.style.left = enemy.x + "px";
  enemy.element.style.top = enemy.y + "px";
  enemy.hpBar.style.width = (enemy.hp / enemy.maxHp) * 20 + "px";
  enemy.hpBar.style.background = enemy.hp / enemy.maxHp < 0.5 ? "yellow" : "green";
}

// Quando inimigo chega no castelo, tira vida do castelo e remove inimigo
function enemyReachedCastle(enemy) {
  if (enemy.isBoss) {
    castleHp -= 200; // Boss causa muito dano
  } else {
    castleHp -= 10;
  }
  if (castleHp < 0) castleHp = 0;
  updateCastleHp();
  clearInterval(enemy.moveInterval);
  enemy.element.remove();
  const index = enemies.indexOf(enemy);
  if(index > -1) enemies.splice(index,1);
}

// Função para spawnar inimigos
function spawnEnemy(type = "normal") {
  if (!allPaths.length) return;
  // Escolhe aleatoriamente um dos caminhos ativos
  const path = allPaths[Math.floor(Math.random() * allPaths.length)];
  const enemyEl = document.createElement("div");
  enemyEl.className = "enemy";
  const hpBar = document.createElement("div");
  hpBar.className = "hpbar";
  enemyEl.appendChild(hpBar);
  let speed, maxHp;
  if (type === "boss") {
    speed = 0.5;
    maxHp = 5000 + (raidLevel-1)*2000;
    enemyEl.style.background = "purple";
    enemyEl.style.width = "40px";
    enemyEl.style.height = "40px";
    enemyEl.style.zIndex = 10;
    enemyEl.style.border = "3px solid gold";
    enemyEl.textContent = "BOSS";
    enemyEl.style.color = "#fff";
    enemyEl.style.fontWeight = "bold";
    enemyEl.style.fontSize = "14px";
    enemyEl.style.display = "flex";
    enemyEl.style.alignItems = "center";
    enemyEl.style.justifyContent = "center";
  } else {
    switch(type) {
      case "fast": speed = 2.5; maxHp = 20 + (raidLevel-1)*10; enemyEl.style.background = "orange"; break;
      case "tank": speed = 0.8; maxHp = 100 + (raidLevel-1)*40; enemyEl.style.background = "blue"; break;
      default: speed = 1.5; maxHp = 40 + (raidLevel-1)*15;
    }
  }
  const enemy = {
    element: enemyEl,
    path: path,
    x: path[0].x,
    y: path[0].y,
    speed,
    hp: maxHp,
    maxHp,
    currentTargetIndex: 1,
    hpBar: hpBar,
    hitCooldown: false,
    isBoss: type === "boss"
  };
  enemyEl.style.left = enemy.x + "px";
  enemyEl.style.top = enemy.y + "px";
  gameArea.appendChild(enemyEl);
  enemy.moveInterval = setInterval(() => {
    moveAlongPath(enemy);
    towerAttack(enemy);
    if(enemy.hp <= 0) {
      clearInterval(enemy.moveInterval);
      enemy.element.remove();
      gold += enemy.isBoss ? 500 : 10;
      goldDisplay.textContent = gold;
      localStorage.setItem("gold", gold);
      const index = enemies.indexOf(enemy);
      if(index > -1) enemies.splice(index,1);
      if (enemy.isBoss && raidEnded) {
        setTimeout(() => alert("Parabéns! Você derrotou o boss e sobreviveu à raid!"), 100);
      }
    }
  }, 30);
  enemies.push(enemy);
}

// Função para disparar projéteis
function shootProjectile(x, y, target, damage) {
  const proj = document.createElement("div");
  proj.className = "projectile";
  proj.style.left = x + "px";
  proj.style.top = y + "px";
  gameArea.appendChild(proj);

  let px = x;
  let py = y;

  const projInterval = setInterval(() => {
    const dx = target.x - px;
    const dy = target.y - py;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if(dist < 4) {
      target.hp -= damage;
      clearInterval(projInterval);
      proj.remove();
      return;
    }
    px += (dx / dist) * 6;
    py += (dy / dist) * 6;
    proj.style.left = px + "px";
    proj.style.top = py + "px";
  }, 20);
}

// As torres atacam os inimigos dentro do alcance
function towerAttack(enemy) {
  towers.forEach(tower => {
    const dx = tower.x - enemy.x;
    const dy = tower.y - enemy.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < tower.range && !enemy.hitCooldown) {
      enemy.hitCooldown = true;
      shootProjectile(tower.x, tower.y, enemy, towerDamage);
      setTimeout(() => enemy.hitCooldown = false, 1000);
    }
  });
}

function upgradeTower() {
  if (gold >= 50) {
    gold -= 50;
    towerDamage += 5;
    goldDisplay.textContent = gold;
    damageDisplay.textContent = towerDamage;
    localStorage.setItem("gold", gold);
    localStorage.setItem("towerDamage", towerDamage);
  }
}

// Início da RAID
function startRaid() {
  raidTime = 0;
  activeRifts = 1;
  bossSpawned = false;
  raidEnded = false;
  waveDisplay.textContent = "0:00";
  allPaths = [];
  activePath = null;
  createNewPathOrBranch(); // caminho inicial
  // Spawner de inimigos
  let spawnInterval = setInterval(() => {
    if (raidEnded) {
      clearInterval(spawnInterval);
      return;
    }
    let r = Math.random();
    if(r < 0.15) spawnEnemy("tank");
    else if(r < 0.5) spawnEnemy("fast");
    else spawnEnemy("normal");
  }, 1000);
  // Timer da raid
  raidInterval = setInterval(() => {
    if (raidEnded) {
      clearInterval(raidInterval);
      return;
    }
    raidTime++;
    let min = Math.floor(raidTime / 60);
    let sec = raidTime % 60;
    waveDisplay.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    // A cada minuto, cria novo caminho ou ramificação
    if (raidTime % 60 === 0) {
      createNewPathOrBranch();
    }
    if (raidTime === 240 && !bossSpawned) {
      bossSpawned = true;
      spawnEnemy("boss");
    }
    if (raidTime >= RAID_DURATION) {
      raidEnded = true;
      clearInterval(raidInterval);
      setTimeout(() => {
        if (!bossSpawned) {
          spawnEnemy("boss");
        }
        showNextRaidBtn();
        if (castleHp > 0) {
          addDiamonds();
          alert("A raid terminou! Sobreviventes: Vitória!");
        } else {
          alert("A raid terminou! Sobreviventes: Derrota!");
        }
      }, 500);
    }
  }, 1000);
}

function showNextRaidBtn() {
  nextRaidBtn.style.display = "inline-block";
}
function hideNextRaidBtn() {
  nextRaidBtn.style.display = "none";
}

function getDiamondReward() {
  // Base: 1 diamante por raid, +1 a cada 10 níveis
  return 1 + Math.floor((raidLevel-1)/10);
}

function addDiamonds() {
  const reward = getDiamondReward();
  diamonds += reward;
  localStorage.setItem("diamonds", diamonds);
  diamondsDisplay.textContent = diamonds;
  setTimeout(() => alert(`Você ganhou ${reward} diamante${reward>1?"s":""}! Total: ${diamonds}`), 200);
}

function nextRaid() {
  raidLevel++;
  localStorage.setItem("raidLevel", raidLevel);
  raidLevelDisplay.textContent = raidLevel;
  // Resetar ouro
  gold = 0;
  localStorage.setItem("gold", gold);
  goldDisplay.textContent = gold;
  // Resetar dano das torres
  towerDamage = 10;
  localStorage.setItem("towerDamage", towerDamage);
  damageDisplay.textContent = towerDamage;
  // Aumentar dificuldade: boss mais forte, inimigos mais fortes, etc (opcional)
  resetRaid();
  startRaid();
  hideNextRaidBtn();
}

function resetRaid() {
  // Limpa inimigos
  enemies.forEach(e => { clearInterval(e.moveInterval); e.element.remove(); });
  enemies.length = 0;
  // Restaura castelo
  castleMaxHp = 100 + (raidLevel-1)*40;
  castleHp = castleMaxHp;
  updateCastleHp();
  // Reset torres (se necessário)
  allPaths = [];
  allBuildSpots = [];
  activePath = null;
}

// Iniciar o jogo quando a página carregar
window.onload = function() {
  hideNextRaidBtn();
  startRaid();
}; 