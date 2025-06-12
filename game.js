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
  ctx.strokeStyle = "#8B5A2B";
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

// Modificar buildTowerAtSpot para registrar a torre
function buildTowerAtSpot(type) {
  if (radialMenuSpotPathIdx == null || radialMenuSpotIdx == null) return;
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
  // Registrar torre para lógica de ataque
  builtTowers.push({
    x: spot.x,
    y: spot.y,
    type: type,
    cooldown: 0
  });
  // Redesenhar pontos (remover ponto branco)
  drawPaths();
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

// Função para ataque das torres
function towersAttackLoop() {
  for (const tower of builtTowers) {
    tower.cooldown = (tower.cooldown || 0) - 1;
    // Torre rápida: atira rápido em 1 alvo
    if (tower.type === 'fast') {
      if (tower.cooldown <= 0) {
        // Procura inimigo mais próximo em alcance 120
        let minDist = 9999;
        let target = null;
        for (const enemy of enemies) {
          const dx = tower.x - enemy.x;
          const dy = tower.y - enemy.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 120 && dist < minDist && enemy.hp > 0) {
            minDist = dist;
            target = enemy;
          }
        }
        if (target) {
          shootProjectileTower(tower, target, towerDamage, 'yellow');
          tower.cooldown = 18; // rápido
        }
      }
    } else if (tower.type === 'aoe') {
      // Torre de área: atira devagar, mas atinge todos próximos
      if (tower.cooldown <= 0) {
        let any = false;
        for (const enemy of enemies) {
          const dx = tower.x - enemy.x;
          const dy = tower.y - enemy.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 100 && enemy.hp > 0) {
            shootProjectileTower(tower, enemy, Math.floor(towerDamage*0.7), 'orange');
            any = true;
          }
        }
        if (any) tower.cooldown = 60; // devagar
      }
    }
  }
}
// Loop de ataque das torres
setInterval(towersAttackLoop, 30);

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