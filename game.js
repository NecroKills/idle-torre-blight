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
let gold = 300; // Ouro inicial sempre 300
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
    // Resetar ouro para 300
    gold = 300;
    localStorage.setItem("gold", gold);
    goldDisplay.textContent = gold;
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

// Portais (pontos de spawn dos inimigos)
let portals = [];

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

function createPortal(x, y) {
  const portal = document.createElement('div');
  portal.className = 'portal';
  portal.style.left = x + 'px';
  portal.style.top = y + 'px';
  gameArea.appendChild(portal);
  return portal;
}

function drawPaths() {
  ctx.clearRect(0, 0, pathsCanvas.width, pathsCanvas.height);
  ctx.lineWidth = 18;
  ctx.strokeStyle = "#8B5A2B";
  ctx.lineCap = "round";

  // Remover portais antigos
  portals.forEach(p => p.remove());
  portals = [];
  
  for (const path of allPaths) {
    // Criar portal no início do caminho
    const startX = path[0].x;
    const startY = path[0].y;
    const portal = createPortal(startX, startY);
    portals.push(portal);
    
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
      if (spot.tower) continue;
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
  const pathIdx = Math.floor(Math.random() * allPaths.length);
  const path = allPaths[pathIdx];
  
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
    isBoss: type === "boss",
    pathIdx
  };
  
  enemyEl.style.left = enemy.x + "px";
  enemyEl.style.top = enemy.y + "px";
  gameArea.appendChild(enemyEl);
  // Efeito de surgimento do portal
  enemyEl.style.opacity = "0.6";
  enemyEl.style.transform = "translate(-50%, -50%) scale(0.3)";
  setTimeout(() => {
    enemyEl.style.opacity = "1";
    enemyEl.style.transform = "translate(-50%, -50%)";
  }, 50);
  
  enemy.moveInterval = setInterval(() => {
    moveAlongPath(enemy);
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

// Array para armazenar torres construídas
let builtTowers = [];

// Custos de upgrade de torre por nível
const towerUpgradeCosts = [50, 100, 150, 300, 500]; // Nível 0→1, 1→2, 2→3, 3→4, 4→5

// Função para verificar se tem ouro suficiente
function hasEnoughGold(amount) {
  if (gold >= amount) {
    gold -= amount;
    goldDisplay.textContent = gold;
    localStorage.setItem("gold", gold);
    return true;
  }
  return false;
}

// Modificar buildTowerAtSpot para considerar custo e nível
function buildTowerAtSpot(type) {
  if (radialMenuSpotPathIdx == null || radialMenuSpotIdx == null) return;
  
  // Verificar se tem ouro suficiente para nível 1
  if (!hasEnoughGold(towerUpgradeCosts[0])) {
    alert(`Ouro insuficiente! Precisa de ${towerUpgradeCosts[0]} ouro.`);
    return;
  }
  
  const spot = allBuildSpots[radialMenuSpotPathIdx][radialMenuSpotIdx];
  spot.tower = type;
  
  // Adicionar torre visual
  const el = document.createElement('div');
  el.className = 'tower';
  el.style.left = spot.x + 'px';
  el.style.top = spot.y + 'px';
  el.style.background = type === 'fast' ? 'yellow' : 'orange';
  el.title = type === 'fast' ? 'Torre Rápida' : 'Torre Lenta (Área)';
  gameArea.appendChild(el);
  
  // Registrar torre para lógica de ataque (agora com nível)
  const tower = {
    x: spot.x,
    y: spot.y,
    type: type,
    cooldown: 0,
    level: 1,
    element: el,
    spotPathIdx: radialMenuSpotPathIdx,
    spotIdx: radialMenuSpotIdx
  };
  
  // Adicionar texto de nível
  const levelText = document.createElement('div');
  levelText.className = 'tower-level';
  levelText.textContent = '1';
  levelText.style.position = 'absolute';
  levelText.style.top = '50%';
  levelText.style.left = '50%';
  levelText.style.transform = 'translate(-50%, -50%)';
  levelText.style.color = 'black';
  levelText.style.fontWeight = 'bold';
  levelText.style.fontSize = '10px';
  levelText.style.pointerEvents = 'none';
  el.appendChild(levelText);
  tower.levelText = levelText;
  
  // Adicionar visualização de alcance
  const rangeCircle = document.createElement('div');
  rangeCircle.className = 'tower-range';
  rangeCircle.style.position = 'absolute';
  rangeCircle.style.top = '50%';
  rangeCircle.style.left = '50%';
  rangeCircle.style.transform = 'translate(-50%, -50%)';
  rangeCircle.style.width = getTowerRange(tower) * 2 + 'px';
  rangeCircle.style.height = getTowerRange(tower) * 2 + 'px';
  rangeCircle.style.border = '1px solid ' + (type === 'fast' ? 'yellow' : 'orange');
  rangeCircle.style.borderRadius = '50%';
  rangeCircle.style.opacity = '0.2';
  rangeCircle.style.pointerEvents = 'none';
  el.appendChild(rangeCircle);
  tower.rangeCircle = rangeCircle;
  
  // Adicionar interaction (click para upgrade)
  el.style.cursor = 'pointer';
  el.onclick = (e) => {
    e.stopPropagation();
    upgradeTowerAtSpot(tower);
  };
  
  builtTowers.push(tower);
  // Redesenhar pontos (remover ponto branco)
  drawPaths();
}

// Função para calcular dano e alcance baseado no nível
function getTowerDamage(tower) {
  const baseDamage = tower.type === 'fast' ? towerDamage : Math.floor(towerDamage * 0.7);
  return baseDamage * (1 + (tower.level - 1) * 0.5); // +50% por nível
}

function getTowerRange(tower) {
  const baseRange = tower.type === 'fast' ? 120 : 100;
  return baseRange * (1 + (tower.level - 1) * 0.1); // +10% por nível
}

function getTowerCooldown(tower) {
  const baseCooldown = tower.type === 'fast' ? 18 : 60;
  return baseCooldown * (1 - (tower.level - 1) * 0.1); // -10% por nível (mais rápido)
}

// Função para upgrade de torre
function upgradeTowerAtSpot(tower) {
  if (tower.level >= 5) {
    // Silenciosamente não faz nada, torre já está no máximo
    return;
  }
  
  const nextLevel = tower.level + 1;
  const cost = towerUpgradeCosts[tower.level - 1]; // -1 porque o array é 0-indexed
  
  if (!hasEnoughGold(cost)) {
    alert(`Ouro insuficiente! Precisa de ${cost} ouro.`);
    return;
  }
  
  // Aplica upgrade
  tower.level = nextLevel;
  tower.levelText.textContent = nextLevel;
  
  // Atualiza alcance e visual
  tower.rangeCircle.style.width = getTowerRange(tower) * 2 + 'px';
  tower.rangeCircle.style.height = getTowerRange(tower) * 2 + 'px';
  
  // Efeito visual de upgrade
  const effect = document.createElement('div');
  effect.className = 'upgrade-effect';
  effect.style.position = 'absolute';
  effect.style.width = '40px';
  effect.style.height = '40px';
  effect.style.background = 'rgba(255,255,255,0.5)';
  effect.style.borderRadius = '50%';
  effect.style.transform = 'translate(-50%, -50%)';
  effect.style.left = tower.x + 'px';
  effect.style.top = tower.y + 'px';
  effect.style.pointerEvents = 'none';
  effect.style.animation = 'towerUpgrade 0.5s forwards';
  gameArea.appendChild(effect);
  setTimeout(() => effect.remove(), 500);
  
  // Torre fica mais forte visualmente
  tower.element.style.border = `${Math.min(3, tower.level - 1)}px solid gold`;
  tower.element.style.boxShadow = `0 0 ${tower.level * 3}px ${tower.type === 'fast' ? 'yellow' : 'orange'}`;
}

// Função para disparar projéteis
function shootProjectileTower(tower, target, damage, color = 'yellow') {
  const proj = document.createElement('div');
  proj.className = 'projectile';
  proj.style.background = color;
  proj.style.left = tower.x + 'px';
  proj.style.top = tower.y + 'px';
  gameArea.appendChild(proj);
  let px = tower.x;
  let py = tower.y;
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
    px += (dx / dist) * 8;
    py += (dy / dist) * 8;
    proj.style.left = px + 'px';
    proj.style.top = py + 'px';
  }, 20);
}

// Atualizar towersAttackLoop para usar os novos cálculos de dano/alcance/cooldown
function towersAttackLoop() {
  for (const tower of builtTowers) {
    tower.cooldown = (tower.cooldown || 0) - 1;
    // Torre rápida: atira rápido em 1 alvo
    if (tower.type === 'fast') {
      if (tower.cooldown <= 0) {
        // Procura inimigo mais próximo em alcance
        const towerRange = getTowerRange(tower);
        let minDist = 9999;
        let target = null;
        for (const enemy of enemies) {
          const dx = tower.x - enemy.x;
          const dy = tower.y - enemy.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < towerRange && dist < minDist && enemy.hp > 0) {
            minDist = dist;
            target = enemy;
          }
        }
        if (target) {
          shootProjectileTower(tower, target, getTowerDamage(tower), 'yellow');
          tower.cooldown = getTowerCooldown(tower);
        }
      }
    } else if (tower.type === 'aoe') {
      // Torre de área: atira devagar, mas atinge todos próximos
      if (tower.cooldown <= 0) {
        let any = false;
        const towerRange = getTowerRange(tower);
        for (const enemy of enemies) {
          const dx = tower.x - enemy.x;
          const dy = tower.y - enemy.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < towerRange && enemy.hp > 0) {
            shootProjectileTower(tower, enemy, getTowerDamage(tower), 'orange');
            any = true;
          }
        }
        if (any) tower.cooldown = getTowerCooldown(tower);
      }
    }
  }
}

// Loop de ataque das torres
setInterval(towersAttackLoop, 30);

// Atualize a função upgradeTower (botão global)
function upgradeTower() {
  alert("Clique diretamente nas torres para fazer upgrade!\n\nCustos de upgrade:\nNível 1: 50 ouro\nNível 2: 100 ouro\nNível 3: 150 ouro\nNível 4: 300 ouro\nNível 5: 500 ouro");
}

// Adicionar estilo de animação para upgrade
const styleEl = document.createElement('style');
styleEl.textContent = `
@keyframes towerUpgrade {
  0% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(2.5); }
}
`;
document.head.appendChild(styleEl);

// Início da RAID
function startRaid() {
  raidTime = 0;
  activeRifts = 1;
  bossSpawned = false;
  raidEnded = false;
  waveDisplay.textContent = "0:00";
  allPaths = [];
  allBuildSpots = [];
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
    // Garantir boss aos 4 minutos
    if (raidTime === 240 && !bossSpawned) {
      bossSpawned = true;
      setTimeout(() => spawnEnemy("boss"), 100); // delay para garantir visualização
    }
    if (raidTime >= RAID_DURATION) {
      raidEnded = true;
      clearInterval(raidInterval);
      setTimeout(() => {
        if (!bossSpawned) {
          bossSpawned = true;
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
  // Resetar ouro sempre para 300
  gold = 300;
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
  // Limpa torres construídas
  builtTowers.forEach(t => {
    // Remove elementos visuais das torres
    const els = document.querySelectorAll('.tower');
    els.forEach(el => el.remove());
  });
  builtTowers = [];
  // Limpa caminhos e pontos de construção
  allPaths = [];
  allBuildSpots = [];
  activePath = null;
}

// Iniciar o jogo quando a página carregar
window.onload = function() {
  hideNextRaidBtn();
  startRaid();
  // DEBUG: Verificar se o canvas está sendo encontrado
  console.log('Canvas encontrado:', pathsCanvas);
  // Adicionar listener de clique no canvas
  pathsCanvas.addEventListener('click', function(e) {
    if (radialMenuActive) return;
    const rect = pathsCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    console.log('Canvas click:', mx, my);
    for (let p = 0; p < allBuildSpots.length; p++) {
      for (let s = 0; s < allBuildSpots[p].length; s++) {
        const spot = allBuildSpots[p][s];
        if (!spot.tower && Math.hypot(spot.x - mx, spot.y - my) < 14) {
          console.log('Spot clicked:', spot, p, s);
          e.stopPropagation();
          showRadialMenu(spot.x, spot.y, p, s);
          return;
        }
      }
    }
  });
};

// --- Radial Menu ---
const radialMenu = document.getElementById("radialMenu");
let radialMenuActive = false;
let radialMenuSpot = null;
let radialMenuSpotPathIdx = null;
let radialMenuSpotIdx = null;

function showRadialMenu(x, y, pathIdx, spotIdx) {
  // Corrigir posição relativa ao #game, considerando offset do canvas
  const left = x + pathsCanvas.offsetLeft - 74;
  const top = y + pathsCanvas.offsetTop - 74;
  radialMenu.innerHTML = '';
  radialMenu.style.display = 'block';
  radialMenu.style.left = left + 'px';
  radialMenu.style.top = top + 'px';
  radialMenuActive = true;
  radialMenuSpot = {x, y};
  radialMenuSpotPathIdx = pathIdx;
  radialMenuSpotIdx = spotIdx;
  // Opções: torre rápida (⚡) e torre lenta (🔥)
  const opts = [
    {icon: '⚡', type: 'fast'},
    {icon: '🔥', type: 'aoe'}
  ];
  opts.forEach((opt, i) => {
    const angle = Math.PI/2 + i * Math.PI; // 2 opções, opostas
    const btn = document.createElement('div');
    btn.className = 'radial-option';
    btn.style.left = (74 + Math.cos(angle)*50 - 24) + 'px';
    btn.style.top = (74 + Math.sin(angle)*50 - 24) + 'px';
    btn.innerHTML = opt.icon;
    btn.onclick = (e) => {
      e.stopPropagation();
      buildTowerAtSpot(opt.type);
      hideRadialMenu();
    };
    radialMenu.appendChild(btn);
  });
  console.log('RadialMenu HTML:', radialMenu.innerHTML);
}
function hideRadialMenu() {
  radialMenu.style.display = 'none';
  radialMenu.innerHTML = '';
  radialMenuActive = false;
  radialMenuSpot = null;
}
// Esconder menu ao clicar fora
window.addEventListener('click', function(e) {
  if (radialMenuActive && !radialMenu.contains(e.target)) {
    hideRadialMenu();
  }
}); 