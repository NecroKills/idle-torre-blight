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

const rifts = [
  [ // Norte
    { x: 600, y: -40 },
    { x: 600, y: 180 },
    { x: centerX, y: centerY }
  ],
  [ // Sul
    { x: 600, y: 640 },
    { x: 600, y: 420 },
    { x: centerX, y: centerY }
  ],
  [ // Leste
    { x: 1240, y: 300 },
    { x: 900, y: 300 },
    { x: centerX, y: centerY }
  ],
  [ // Oeste
    { x: -40, y: 300 },
    { x: 300, y: 300 },
    { x: centerX, y: centerY }
  ],
  [ // Nordeste
    { x: 1100, y: -40 },
    { x: 900, y: 180 },
    { x: centerX, y: centerY }
  ]
];

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
  const path = rifts[enemy.path];
  if (enemy.currentTargetIndex === undefined) enemy.currentTargetIndex = 1;
  const target = path[enemy.currentTargetIndex];
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < enemy.speed) {
    // Chegou no ponto, avança
    enemy.x = target.x;
    enemy.y = target.y;
    enemy.currentTargetIndex++;
    if (enemy.currentTargetIndex >= path.length) {
      // Chegou no castelo!
      enemyReachedCastle(enemy);
      return;
    }
  } else {
    enemy.x += (dx / dist) * enemy.speed;
    enemy.y += (dy / dist) * enemy.speed;
  }
  enemy.element.style.left = enemy.x + "px";
  enemy.element.style.top = enemy.y + "px";

  // Atualiza barra de vida
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
function spawnEnemy(type = "normal", forcedPath = null) {
  // Escolhe aleatoriamente uma fenda ativa
  let chosenRiftIdx;
  if (forcedPath !== null) {
    chosenRiftIdx = forcedPath;
  } else {
    chosenRiftIdx = Math.floor(Math.random() * activeRifts);
  }
  const path = rifts[chosenRiftIdx];

  const enemyEl = document.createElement("div");
  enemyEl.className = "enemy";

  const hpBar = document.createElement("div");
  hpBar.className = "hpbar";
  enemyEl.appendChild(hpBar);

  let speed, maxHp;
  if (type === "boss") {
    speed = 0.5;
    maxHp = 5000 + (raidLevel-1)*2000; // Boss mais forte por nível
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
      case "fast":
        speed = 2.5;
        maxHp = 20 + (raidLevel-1)*10;
        enemyEl.style.background = "orange";
        break;
      case "tank":
        speed = 0.8;
        maxHp = 100 + (raidLevel-1)*40;
        enemyEl.style.background = "blue";
        break;
      default:
        speed = 1.5;
        maxHp = 40 + (raidLevel-1)*15;
    }
  }

  const enemy = {
    element: enemyEl,
    path: chosenRiftIdx,
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
      // Remove da lista enemies
      const index = enemies.indexOf(enemy);
      if(index > -1) enemies.splice(index,1);
      // Se era o boss, mostrar mensagem de vitória se raid acabou
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

  // Spawner de inimigos
  let spawnInterval = setInterval(() => {
    if (raidEnded) {
      clearInterval(spawnInterval);
      return;
    }
    // Não spawna boss aqui
    // Spawna inimigos normais nas fendas ativas
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
    // Atualiza tempo na tela
    let min = Math.floor(raidTime / 60);
    let sec = raidTime % 60;
    waveDisplay.textContent = `${min}:${sec.toString().padStart(2, '0')}`;

    // A cada minuto, ativa uma nova fenda (até 5)
    if (raidTime % 60 === 0 && activeRifts < 5) {
      activeRifts++;
    }
    // No minuto 4 (240s), spawna o boss se ainda não spawnou
    if (raidTime === 240 && !bossSpawned) {
      bossSpawned = true;
      spawnEnemy("boss", activeRifts-1); // Boss nasce na última fenda aberta
    }
    // Fim da raid
    if (raidTime >= RAID_DURATION) {
      raidEnded = true;
      clearInterval(raidInterval);
      setTimeout(() => {
        if (!bossSpawned) {
          spawnEnemy("boss", activeRifts-1);
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
}

// Iniciar o jogo quando a página carregar
window.onload = function() {
  hideNextRaidBtn();
  startRaid();
}; 