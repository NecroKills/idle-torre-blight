import { 
    RAID_DURATION, 
    NUM_SECTORS, 
    CASTLE_EXCLUSION_HALF_SIZE, 
    CENTER_X, 
    CENTER_Y, 
    TOWER_UPGRADE_COSTS 
} from './js/data/constants.js';
// import { getTowerDamage, getTowerRange, getTowerCooldown } from './js/data/tower-stats.js'; // REMOVIDO

const gameArea = document.getElementById("game");
const goldDisplay = document.getElementById("gold");
const waveDisplay = document.getElementById("wave");
const castleHpBarInner = document.querySelector("#castleHpBar > div:last-child");
const castleHpPercentage = document.getElementById("castleHpPercentage");
const raidLevelDisplay = document.getElementById("raidLevel");
const nextRaidBtn = document.getElementById("nextRaidBtn");
const diamondsDisplay = document.getElementById("diamonds");
const pauseBtn = document.getElementById("pauseBtn");
const helpBtn = document.getElementById("helpBtn");

// --- Controle de Câmera (Zoom e Pan) ---
let scale = 1.0;
let offsetX = 0.0;
let offsetY = 0.0;
let isDragging = false;
let lastMousePosition = { x: 0, y: 0 };
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;

function updateGameTransform() {
    gameArea.style.transformOrigin = '0 0';
    gameArea.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

// Estado inicial
let gold = 300; // Ouro inicial sempre 300
let wave = 0; // Não usaremos mais o sistema de ondas
let towerDamage = parseInt(localStorage.getItem("towerDamage")) || 10;
let raidLevel = parseInt(localStorage.getItem("raidLevel")) || 1;
let diamonds = parseInt(localStorage.getItem("diamonds")) || 0;
let isPaused = false;
let pausedByHelp = false; // flag para controlar a pausa do modal de ajuda

goldDisplay.textContent = gold;
waveDisplay.textContent = wave;
raidLevelDisplay.textContent = raidLevel;
diamondsDisplay.textContent = diamonds;

// RAID CONFIG
let raidTime = 0;
let raidInterval = null;
let activeRifts = 1; // Começa com 1 fenda
let bossSpawned = false;
let raidEnded = false;

// --- Configuração dos Caminhos ---
let occupiedSectors = [];

// Castelo
let castleMaxHp = 100;
let castleHp = castleMaxHp;

function updateCastleHp() {
  // Guard clause para evitar múltiplas execuções de 'game over'
  if (raidEnded) return;

  const perc = Math.round(Math.max(0, (castleHp / castleMaxHp) * 100));
  castleHpBarInner.style.width = perc + "%";
  castleHpPercentage.textContent = `${perc}%`;

  // Altera a cor da barra de vida
  if (perc > 50) {
    castleHpBarInner.style.backgroundColor = 'lime';
  } else if (perc > 25) {
    castleHpBarInner.style.backgroundColor = 'yellow';
  } else {
    castleHpBarInner.style.backgroundColor = 'red';
  }

  if (castleHp <= 0) {
    raidEnded = true;
    pauseGame(); // Pausa o jogo imediatamente para parar todas as outras ações.

    // Força a atualização final da UI
    castleHpBarInner.style.width = '0%';
    castleHpPercentage.textContent = '0%';
    
    // Adia a sobreposição de fim de jogo para garantir que a UI seja renderizada.
    setTimeout(() => {
        const gameOverOverlay = document.createElement('div');
        gameOverOverlay.id = 'gameOverOverlay';
        gameOverOverlay.innerHTML = `
            <h1>Fim de Jogo</h1>
            <p>A base foi destruída!</p>
            <p>Reiniciando em 3 segundos...</p>
        `;
        gameArea.appendChild(gameOverOverlay);

        // Um segundo timeout para o recarregamento.
        setTimeout(() => {
            location.reload();
        }, 3000);
    }, 50); // Um pequeno delay para a renderização.
  }
}
updateCastleHp();

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

function getStartPointForAngle(angle) {
    const w = 1200, h = 600;
    const center = { x: w / 2, y: h / 2 };
    
    const tanTheta = Math.tan(angle);
    const cornerTan = (h/2)/(w/2);

    let x, y;

    if (Math.abs(tanTheta) < cornerTan) {
        if (Math.cos(angle) > 0) { // Right edge
            x = w;
            y = center.y - (w/2) * tanTheta;
        } else { // Left edge
            x = 0;
            y = center.y + (w/2) * tanTheta;
        }
    } else {
        if (Math.sin(angle) > 0) { // Bottom edge
            y = h;
            x = center.x - (h/2) / tanTheta;
        } else { // Top edge
            y = 0;
            x = center.x + (h/2) / tanTheta;
        }
    }
    return { x, y };
}

function generateCleanPath(start, end, segments = 7, mergesWithCenter = true) {
    const waypoints = [start];
    const totalVec = { x: end.x - start.x, y: end.y - start.y };
    const totalDist = Math.hypot(totalVec.x, totalVec.y);
    const perpVec = { x: -totalVec.y / totalDist, y: totalVec.x / totalDist };

    for (let i = 1; i < segments; i++) {
        const progress = i / segments;
        const pointOnLine = {
            x: start.x + totalVec.x * progress,
            y: start.y + totalVec.y * progress
        };
        
        const maxOffset = 150 * (1 - progress * 0.8);
        const offset = randomBetween(-maxOffset, maxOffset);
        
        let pointX = pointOnLine.x + perpVec.x * offset;
        let pointY = pointOnLine.y + perpVec.y * offset;
        
        // Clamp to canvas bounds with a margin
        pointX = Math.max(15, Math.min(1185, pointX));
        pointY = Math.max(15, Math.min(585, pointY));
        
        waypoints.push({
            x: pointX,
            y: pointY
        });
    }

    if (mergesWithCenter) {
        // For the main trunk, find intersection with the square exclusion zone
        const lastPoint = waypoints[waypoints.length - 1];
        const dx = CENTER_X - lastPoint.x;
        const dy = CENTER_Y - lastPoint.y;
        const angle = Math.atan2(dy, dx);

        // Account for line thickness (18/2=9) by adding it to the distance
        const halfSize = CASTLE_EXCLUSION_HALF_SIZE;
        
        // Calculate the exact distance from the center to the square's edge at this angle
        const distanceToEdge = halfSize / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
        const finalDistance = distanceToEdge + (ctx.lineWidth / 2);

        // Get the unit vector from the last point towards the center
        const totalDist = Math.hypot(dx, dy);
        const unitDx = dx / totalDist;
        const unitDy = dy / totalDist;
        
        // Calculate the final point by moving from the center back along the line
        const finalX = CENTER_X - unitDx * finalDistance;
        const finalY = CENTER_Y - unitDy * finalDistance;

        waypoints.push({x: finalX, y: finalY});
    } else {
        // For branches, the final waypoint is the merge point itself
        waypoints.push(end);
    }

    return waypoints;
}

function isPositionValid(x, y, allSpotArrays, minDistance) {
    // Check against central square exclusion zone
    if (Math.abs(x - CENTER_X) < CASTLE_EXCLUSION_HALF_SIZE && Math.abs(y - CENTER_Y) < CASTLE_EXCLUSION_HALF_SIZE) {
        return false;
    }
    
    const minDistSq = minDistance * minDistance;
    for (const spotArray of allSpotArrays) {
        for (const spot of spotArray) {
            const dx = x - spot.x;
            const dy = y - spot.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                return false;
            }
        }
    }
    return true;
}

function generateBuildSpotsForPath(path, existingSpotArrays) {
  const spots = [];
  const numSpots = 6 + Math.floor(Math.random() * 4); // 6 a 9 pontos por caminho
  const minSpotDist = 25;

  const inCluster = Math.random() < 0.5;
  const clusterBase = inCluster ? path[1 + Math.floor(Math.random() * (path.length - 3))] : null;
  const clusterCount = 3 + Math.floor(Math.random() * 2); // 3 ou 4

  for (let i = 0; i < numSpots; i++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      let base, randomDist;
      
      if (inCluster && i < clusterCount) {
        base = clusterBase;
        randomDist = 20;
      } else {
        const segIdx = 1 + Math.floor(Math.random() * (path.length - 2));
        if (!path[segIdx]) continue; // Safety check
        base = path[segIdx];
        randomDist = 30;
      }

      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * randomDist;
      const x = base.x + Math.cos(angle) * dist;
      const y = base.y + Math.sin(angle) * dist;
      
      if (isPositionValid(x, y, [spots, ...existingSpotArrays], minSpotDist)) {
        spots.push({ x, y });
        break; 
      }
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
  ctx.lineCap = "butt";   // Final da linha reto
  ctx.lineJoin = "round"; // Curvas arredondadas

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

function createNewPath() {
    if (occupiedSectors.length >= NUM_SECTORS) return;
    const center = {x: CENTER_X, y: CENTER_Y};
    const availableSectors = Array.from({length: NUM_SECTORS}, (_, i) => i)
                                  .filter(s => !occupiedSectors.includes(s));
    if (availableSectors.length === 0) return;
    const chosenSector = availableSectors[Math.floor(Math.random() * availableSectors.length)];
    occupiedSectors.push(chosenSector);

    const sectorAngle = (2 * Math.PI) / NUM_SECTORS;
    const midAngle = sectorAngle * chosenSector + sectorAngle / 2;
    const randomAngle = midAngle + randomBetween(-sectorAngle / 4, sectorAngle / 4);
    const start = getStartPointForAngle(randomAngle);

    // If it's the first path, create the main TRUNK.
    if (allPaths.length === 0) {
        const path = generateCleanPath(start, center, 7, true);
        allPaths.push(path);
        allBuildSpots.push(generateBuildSpotsForPath(path, []));
    } 
    // Otherwise, create a BRANCH that merges into the trunk.
    else {
        const trunkPath = allPaths[0];
        // Merge into the middle part of the trunk
        const mergeIndex = Math.floor(randomBetween(trunkPath.length * 0.3, trunkPath.length * 0.7));
        const mergePoint = trunkPath[mergeIndex];

        // Generate the branch path from the new start to the merge point
        const branchWaypoints = generateCleanPath(start, mergePoint, 7, false);
        
        // The final path for enemies is the branch + the rest of the trunk
        const trunkSegment = trunkPath.slice(mergeIndex);
        const finalPath = [...branchWaypoints, ...trunkSegment];
        allPaths.push(finalPath);
        
        // Generate build spots for the new branch segment only
        allBuildSpots.push(generateBuildSpotsForPath(branchWaypoints, allBuildSpots));
    }
    
    drawPaths();
}

// Lista de inimigos vivos
const enemies = [];

// Função para mover inimigos entre waypoints do seu caminho
function moveAlongPath(enemy) {
  if (isPaused) return;
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

  // Update boss HP percentage text
  if (enemy.isBoss) {
    const hpPerc = Math.round((enemy.hp / enemy.maxHp) * 100);
    enemy.element.textContent = `${Math.max(0, hpPerc)}%`;
  }
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
    enemyEl.textContent = "100%";
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
    if (isPaused) return;
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

// Função para calcular dano e alcance baseado no nível
function getTowerDamage(tower) {
  let baseDamage;
  switch(tower.type) {
    case 'fast': baseDamage = towerDamage; break;
    case 'aoe': baseDamage = Math.floor(towerDamage * 0.7); break;
    case 'freeze': baseDamage = Math.floor(towerDamage * 0.5); break; // Dano baixo
    case 'buff': baseDamage = 0; break; // Não causa dano
    case 'sniper': baseDamage = towerDamage * 5; break; // Dano muito alto
    default: baseDamage = towerDamage;
  }
  return baseDamage * (1 + (tower.level - 1) * 0.5); // +50% por nível
}

function getTowerRange(tower) {
  let baseRange;
  switch(tower.type) {
    case 'fast': baseRange = 120; break;
    case 'aoe': baseRange = 100; break;
    case 'freeze': baseRange = 90; break;
    case 'buff': baseRange = 80; break; // Alcance menor
    case 'sniper': baseRange = 220; break; // Alcance muito alto
    default: baseRange = 100;
  }
  return baseRange * (1 + (tower.level - 1) * 0.1); // +10% por nível
}

function getTowerCooldown(tower) {
  let baseCooldown;
  switch(tower.type) {
    case 'fast': baseCooldown = 18; break;
    case 'aoe': baseCooldown = 60; break;
    case 'freeze': baseCooldown = 40; break;
    case 'buff': baseCooldown = 10; break; // Atualização constante do buff
    case 'sniper': baseCooldown = 150; break; // Recarga muito lenta
    default: baseCooldown = 30;
  }
  return baseCooldown * (1 - (tower.level - 1) * 0.1); // -10% por nível (mais rápido)
}

// Função para upgrade de torre
function upgradeTowerAtSpot(tower) {
  if (tower.level >= 5) {
    // Silenciosamente não faz nada, torre já está no máximo
    return;
  }
  
  const cost = TOWER_UPGRADE_COSTS[tower.level]; 
  
  if (gold < cost) {
    tower.element.classList.add('shake-error');
    setTimeout(() => {
        tower.element.classList.remove('shake-error');
    }, 400);
    return;
  }
  
  // Deduz ouro somente se houver o suficiente
  gold -= cost;
  goldDisplay.textContent = gold;
  localStorage.setItem("gold", gold);
  
  // Aplica upgrade
  tower.level++;
  tower.levelText.textContent = tower.level;
  
  // Atualiza alcance e visual
  tower.rangeCircle.style.width = getTowerRange(tower) * 2 + 'px';
  tower.rangeCircle.style.height = getTowerRange(tower) * 2 + 'px';
  
  // Atualiza tooltip para o próximo nível
  updateTowerTooltip(tower);
  
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

  // Também garantir que updatePulseSize seja chamado após upgrades
  if (tower.type === 'buff' && tower.updatePulseSize) tower.updatePulseSize();

  // Função utilitária para atualizar todos os buffs visuais
  updateAllBuffEffects();
}

function updateTowerTooltip(tower) {
    if (tower.level >= 5) {
        tower.tooltip.textContent = 'Nível Máximo';
    } else {
        const cost = TOWER_UPGRADE_COSTS[tower.level];
        tower.tooltip.textContent = `Upgrade: ${cost}g`;
        if (gold < cost) {
            tower.tooltip.style.color = '#ff8a8a'; // Vermelho claro para indicar falta de ouro
        } else {
            tower.tooltip.style.color = '#fff'; // Cor padrão
        }
    }
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
    if (isPaused) return;
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

// Função para disparar projéteis com efeito de congelamento
function shootFreezeProjectile(tower, target, damage, slowFactor) {
  const proj = document.createElement('div');
  proj.className = 'projectile';
  proj.style.background = '#00ccff';
  proj.style.left = tower.x + 'px';
  proj.style.top = tower.y + 'px';
  gameArea.appendChild(proj);
  let px = tower.x;
  let py = tower.y;
  const projInterval = setInterval(() => {
    if (isPaused) return;
    const dx = target.x - px;
    const dy = target.y - py;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if(dist < 4) {
      target.hp -= damage;
      
      // Aplicar efeito de lentidão
      if (!target.slowed) {
        target.originalSpeed = target.speed;
        target.slowed = true;
      }
      
      // Garante que o fator de lentidão não passe de 90% para evitar velocidade negativa
      const effectiveSlow = Math.min(0.9, slowFactor);
      target.speed = target.originalSpeed * (1 - effectiveSlow);
      
      // Efeito visual de congelamento
      target.element.style.boxShadow = `0 0 10px #00ccff`;
      
      // Remover efeito após um tempo
      setTimeout(() => {
        if (target && target.element && target.element.parentNode) {
          target.speed = target.originalSpeed;
          target.slowed = false;
          target.element.style.boxShadow = '';
        }
      }, 2000 + tower.level * 500); // Duração aumenta com o nível
      
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

// Função para aplicar buff às torres próximas
function applyBuffToNearbyTowers(buffTower) {
  const buffRange = getTowerRange(buffTower);
  const buffFactor = 0.2 + (buffTower.level - 1) * 0.1; // 20% + 10% por nível
  
  // Verificar todas as torres para aplicar buff
  for (const tower of builtTowers) {
    // Não aplicar buff em si mesmo ou em outras torres de buff
    if (tower === buffTower || tower.type === 'buff') continue;
    
    const dx = buffTower.x - tower.x;
    const dy = buffTower.y - tower.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    // Se a torre está dentro do alcance do buff
    if (dist < buffRange) {
      // Marcar a torre como com buff ativo
      tower._buffedBy = (tower._buffedBy || 0) + 1;
    } else if (tower._buffedBy > 0) {
      // Remover buff se a torre saiu do alcance
      tower._buffedBy = 0;
    }
  }
}

function findTarget(tower) {
    const towerRange = getTowerRange(tower);
    let target = null;

    // A lógica de mira difere por tipo de torre
    switch (tower.type) {
        case 'fast': {
            let minHp = Infinity;
            for (const enemy of enemies) {
                const dist = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
                if (dist < towerRange && enemy.hp > 0 && enemy.hp < minHp) {
                    minHp = enemy.hp;
                    target = enemy;
                }
            }
            break;
        }
        case 'sniper': {
            let maxHp = -1;
            for (const enemy of enemies) {
                const dist = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
                if (dist < towerRange && enemy.hp > 0 && enemy.hp > maxHp) {
                    maxHp = enemy.hp;
                    target = enemy;
                }
            }
            break;
        }
        case 'freeze': {
            let minDist = Infinity;
            let finalTarget = null;
            // Prioriza inimigos não lentos
            for (const enemy of enemies) {
                const dist = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
                if (dist < towerRange && enemy.hp > 0 && !enemy.slowed && dist < minDist) {
                    minDist = dist;
                    finalTarget = enemy;
                }
            }
            // Se todos estiverem lentos, ataca o mais próximo
            if (!finalTarget) {
                minDist = Infinity;
                for (const enemy of enemies) {
                     const dist = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
                     if (dist < towerRange && enemy.hp > 0 && dist < minDist) {
                        minDist = dist;
                        finalTarget = enemy;
                     }
                }
            }
            target = finalTarget;
            break;
        }
        case 'aoe': // Para mira, a torre de área foca no inimigo mais próximo
        default: { // Comportamento padrão: mirar no mais próximo
            let minDist = Infinity;
            for (const enemy of enemies) {
                const dist = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
                if (dist < towerRange && enemy.hp > 0 && dist < minDist) {
                    minDist = dist;
                    target = enemy;
                }
            }
            break;
        }
    }
    return target;
}

// Atualizar towersAttackLoop para usar os novos cálculos de dano/alcance/cooldown
function towersAttackLoop() {
  if (isPaused) return;
  for (const tower of builtTowers) {
    tower.cooldown -= 1;

    // Lógica de Buff (não ataca)
    if (tower.type === 'buff') {
      applyBuffToNearbyTowers(tower);
      continue; 
    }
    
    // Lógica de ataque para a torre de Área (AOE)
    if (tower.type === 'aoe') {
      // Apontar rocket-box para o alvo mais próximo
      const target = findTarget(tower);
      if (tower.rocketBox && target) {
        const angleDeg = Math.atan2(target.y - tower.y, target.x - tower.x) * 180 / Math.PI;
        tower.rocketBox.style.transform = `translate(-50%, 0) rotate(${angleDeg + 90}deg)`;
      }
      if (tower.cooldown <= 0) {
        let fired = false;
        const towerRange = getTowerRange(tower);
        for (const enemy of enemies) {
          const dist = Math.hypot(tower.x - enemy.x, tower.y - enemy.y);
          if (dist < towerRange && enemy.hp > 0) {
            shootProjectileTower(tower, enemy, getTowerDamage(tower), 'orange');
            fired = true;
          }
        }
        if (fired) {
          tower.cooldown = getTowerCooldown(tower);
        }
      }
      continue; // Pula o resto do loop para a torre AOE
    }

    // --- Lógica para todas as outras torres (de alvo único) ---

    // 1. Encontrar um alvo
    const target = findTarget(tower);

    // 2. Apontar a arma se ela existir
    if (tower.gunElement) {
      if (target) {
        const angleDeg = Math.atan2(target.y - tower.y, target.x - tower.x) * 180 / Math.PI;
        tower.gunElement.style.transform = `rotate(${angleDeg + 90}deg)`;
      }
    }

    // 3. Atirar se houver um alvo e o cooldown estiver pronto
    if (target && tower.cooldown <= 0) {
      const damage = getTowerDamage(tower);

      // Animação de tiro (apenas para a torre rápida)
      if (tower.spinnerElement) {
          tower.spinnerElement.classList.add('is-shooting');
          setTimeout(() => {
              if (tower.spinnerElement) {
                 tower.spinnerElement.classList.remove('is-shooting');
              }
          }, 200);
      }
      
      // Disparar o projétil correto
      if (tower.type === 'freeze') {
          // Apontar o canhão e cristal para o alvo
          const target = findTarget(tower);
          if (tower.gunElement && target) {
            const angleDeg = Math.atan2(target.y - tower.y, target.x - tower.x) * 180 / Math.PI;
            tower.gunElement.style.transform = `rotate(${angleDeg + 90}deg)`;
          }
          // Atirar se houver alvo e cooldown
          if (target && tower.cooldown <= 0) {
            const damage = getTowerDamage(tower);
            shootFreezeProjectile(tower, target, damage, 0.5);
            tower.cooldown = getTowerCooldown(tower);
            // Animação de vapor congelante
            if (tower.crystalElement) {
              const vapor = document.createElement('div');
              vapor.className = 'freeze-vapor';
              tower.crystalElement.appendChild(vapor);
              setTimeout(() => vapor.remove(), 450);
            }
          }
          continue;
      } else {
          const color = tower.type === 'sniper' ? '#8A2BE2' : 'yellow';
          shootProjectileTower(tower, target, damage, color);
      }

      // Resetar cooldown
      tower.cooldown = getTowerCooldown(tower);

      // --- Animação de recuo ao atirar (rifle/sniper) ---
      if (tower.type === 'sniper' && tower.barrelElement) {
        tower.barrelElement.classList.add('sniper-recoil');
        setTimeout(() => {
          if (tower.barrelElement) tower.barrelElement.classList.remove('sniper-recoil');
        }, 180);
      }
    }
  }
}

// Função para exibir modal de ajuda
function showHelp() {
  if (!isPaused) {
    pausedByHelp = true;
    pauseGame();
  }
  const modal = document.getElementById("helpModal");
  modal.style.display = "block";
  
  const closeHelpModal = () => {
    modal.style.display = "none";
    if (pausedByHelp) {
      resumeGame();
      pausedByHelp = false;
    }
    // Remove os listeners para não acumularem
    window.removeEventListener('click', closeOnOutsideClick);
    closeBtn.removeEventListener('click', closeHelpModal);
  };

  const closeBtn = modal.querySelector(".close");
  // Adiciona listeners que serão removidos ao fechar
  closeBtn.addEventListener('click', closeHelpModal);
  
  const closeOnOutsideClick = (event) => {
    if (event.target == modal) {
      closeHelpModal();
    }
  };
  window.addEventListener('click', closeOnOutsideClick);
}

// Loop de ataque das torres
setInterval(towersAttackLoop, 30);

// Remover a antiga função upgradeTower, agora usamos showHelp

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
  occupiedSectors = [];
  createNewPath(); // caminho inicial (tronco)
  // Spawner de inimigos
  let spawnInterval = setInterval(() => {
    if (isPaused) return;
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
    if (isPaused) return;
    if (raidEnded) {
      clearInterval(raidInterval);
      return;
    }
    raidTime++;
    let min = Math.floor(raidTime / 60);
    let sec = raidTime % 60;
    waveDisplay.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    // A cada minuto, cria novo caminho, até o minuto 4
    if (raidTime > 0 && raidTime % 60 === 0 && raidTime <= 240) {
      createNewPath();
    }
    // Garantir boss aos 5 minutos
    if (raidTime === 300 && !bossSpawned) {
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
  // Resetar dano das torres
  towerDamage = 10;
  localStorage.setItem("towerDamage", towerDamage);
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
  occupiedSectors = [];
}

// --- Funções de Pausa ---
function pauseGame() {
    isPaused = true;
    pauseBtn.textContent = "▶️";
}

function resumeGame() {
    isPaused = false;
    pauseBtn.textContent = "⏸️";
}

function togglePause() {
    if (isPaused) {
        resumeGame();
    } else {
        pauseGame();
    }
}

// --- Funções de Câmera e Coordenadas ---
function screenToWorld(clientX, clientY) {
    const rect = gameArea.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;
    const worldX = relativeX / scale;
    const worldY = relativeY / scale;
    return { x: worldX, y: worldY };
}

// Iniciar o jogo quando a página carregar
window.onload = function() {
  hideNextRaidBtn();
  startRaid();
  // Adicionar listener de clique no canvas
  pathsCanvas.addEventListener('click', function(e) {
    if (radialMenuActive) return;
    // Converte as coordenadas do clique para as coordenadas do mundo do jogo
    const worldCoords = screenToWorld(e.clientX, e.clientY);
    const mx = worldCoords.x;
    const my = worldCoords.y;

    for (let p = 0; p < allBuildSpots.length; p++) {
      for (let s = 0; s < allBuildSpots[p].length; s++) {
        const spot = allBuildSpots[p][s];
        if (!spot.tower && Math.hypot(spot.x - mx, spot.y - my) < 14) {
          e.stopPropagation();
          showRadialMenu(spot.x, spot.y, p, s);
          return;
        }
      }
    }
  });
  // Adicionar listeners para os botões
  pauseBtn.addEventListener('click', togglePause);
  helpBtn.addEventListener('click', showHelp);
  nextRaidBtn.addEventListener('click', nextRaid);

    // --- EVENT LISTENERS PARA ZOOM E PAN ---
    gameArea.addEventListener('wheel', (event) => {
        event.preventDefault();

        const rect = gameArea.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        const worldXBeforeZoom = mouseX / scale;
        const worldYBeforeZoom = mouseY / scale;

        const scaleAmount = -event.deltaY * 0.001;
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * (1 + scaleAmount)));

        offsetX += (mouseX - scale * worldXBeforeZoom);
        offsetY += (mouseY - scale * worldYBeforeZoom);
        
        updateGameTransform();
    }, { passive: false });

    gameArea.addEventListener('mousedown', (event) => {
        if (event.button === 1 || event.button === 2 || (event.button === 0 && event.ctrlKey)) {
            isDragging = true;
            lastMousePosition = { x: event.clientX, y: event.clientY };
            gameArea.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (event) => {
        if (isDragging) {
            const dx = event.clientX - lastMousePosition.x;
            const dy = event.clientY - lastMousePosition.y;
            offsetX += dx;
            offsetY += dy;
            lastMousePosition = { x: event.clientX, y: event.clientY };
            updateGameTransform();
        }
    });

    const stopDragging = () => {
        isDragging = false;
        gameArea.style.cursor = 'default';
    };

    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('mouseleave', stopDragging);
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
  // Opções: torre rápida (⚡), torre lenta (🔥), torre de resfriamento (❄️), torre de capacitação (🧙)
  const opts = [
    {icon: '⚡', type: 'fast'},
    {icon: '🔥', type: 'aoe'},
    {icon: '❄️', type: 'freeze'},
    {icon: '🧙', type: 'buff'},
    {icon: '🎯', type: 'sniper'}
  ];
  const numOpts = opts.length;
  const angleStep = (2 * Math.PI) / numOpts;
  const startAngle = -Math.PI / 2; // Começar do topo

  opts.forEach((opt, i) => {
    const angle = startAngle + i * angleStep;
    const btn = document.createElement('div');
    btn.className = 'radial-option';
    btn.style.left = (74 + Math.cos(angle)*50 - 24) + 'px';
    btn.style.top = (74 + Math.sin(angle)*50 - 24) + 'px';
    btn.innerHTML = opt.icon;
    btn.onclick = (e) => {
      e.stopPropagation();
      const success = buildTowerAtSpot(opt.type, btn);
      if (success) {
        hideRadialMenu();
      }
    };
    radialMenu.appendChild(btn);
  });
}
function hideRadialMenu() {
  if (!radialMenuActive) return;
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

function buildTowerAtSpot(type, clickedButton) {
  if (radialMenuSpotPathIdx == null || radialMenuSpotIdx == null) return false;
  
  const cost = TOWER_UPGRADE_COSTS[0];
  if (gold < cost) {
    if(clickedButton) {
        clickedButton.classList.add('shake-error-simple');
        setTimeout(() => {
            clickedButton.classList.remove('shake-error-simple');
        }, 400);
    }
    return false;
  }
  
  gold -= cost;
  goldDisplay.textContent = gold;
  localStorage.setItem("gold", gold);
  
  const spot = allBuildSpots[radialMenuSpotPathIdx][radialMenuSpotIdx];
  spot.tower = type;
  
  const towerElement = document.createElement('div');
  towerElement.className = 'tower';
  towerElement.style.left = spot.x + 'px';
  towerElement.style.top = spot.y + 'px';

  const tower = {
    x: spot.x,
    y: spot.y,
    type: type,
    cooldown: 0,
    level: 1,
    element: towerElement,
    spotPathIdx: radialMenuSpotPathIdx,
    spotIdx: radialMenuSpotIdx
  };
  
  const towerSize = 20;
  towerElement.style.width = towerSize + 'px';
  towerElement.style.height = towerSize + 'px';
  towerElement.innerHTML = ''; 

  if (type === "fast") {
    towerElement.style.backgroundColor = "transparent";
    towerElement.classList.add('fast-tower');
    towerElement.title = 'Torre Rápida';

    const base = document.createElement('div');
    base.className = 'tower-base';
    const glow = document.createElement('div');
    glow.className = 'gun-glow';
    const gunContainer = document.createElement('div');
    gunContainer.className = 'gun-container';
    const gun = document.createElement('div');
    gun.className = 'tower-gun';
    const barrel = document.createElement('div');
    barrel.className = 'gun-barrel';
    const spinner = document.createElement('div');
    spinner.className = 'barrel-spinner';
    const tip = document.createElement('div');
    tip.className = 'barrel-tip';

    barrel.appendChild(spinner);
    gun.appendChild(barrel);
    gun.appendChild(tip);
    gunContainer.appendChild(gun);
    
    towerElement.appendChild(base);
    towerElement.appendChild(glow);
    towerElement.appendChild(gunContainer);

    tower.gunElement = gun;
    tower.spinnerElement = spinner;

  } else if (type === "aoe") {
    towerElement.style.backgroundColor = "transparent";
    towerElement.classList.add('aoe-tower');
    towerElement.title = 'Torre de Foguetes';

    const base = document.createElement('div');
    base.className = 'tower-base aoe-base';
    // Caixa dos lançadores
    const rocketBox = document.createElement('div');
    rocketBox.className = 'rocket-box';
    // Criar 9 canos (3x3)
    for (let i = 0; i < 9; i++) {
      const tube = document.createElement('div');
      tube.className = 'rocket-tube';
      rocketBox.appendChild(tube);
    }
    towerElement.appendChild(base);
    towerElement.appendChild(rocketBox);
    tower.rocketBox = rocketBox;
    tower.rocketTubes = rocketBox.children;
  } else if (type === "freeze") {
    towerElement.style.backgroundColor = "transparent";
    towerElement.classList.add('freeze-tower');
    towerElement.title = 'Torre de Gelo';

    const base = document.createElement('div');
    base.className = 'tower-base freeze-base';
    // Reservatórios laterais
    const tankLeft = document.createElement('div');
    tankLeft.className = 'freeze-tank freeze-tank-left';
    const tankRight = document.createElement('div');
    tankRight.className = 'freeze-tank freeze-tank-right';
    // Canhão central
    const gunContainer = document.createElement('div');
    gunContainer.className = 'freeze-gun-container';
    const gun = document.createElement('div');
    gun.className = 'freeze-gun';
    const barrel = document.createElement('div');
    barrel.className = 'freeze-barrel';
    const crystal = document.createElement('div');
    crystal.className = 'freeze-crystal-tip';
    gun.appendChild(barrel);
    gun.appendChild(crystal);
    gunContainer.appendChild(gun);
    // Montagem
    towerElement.appendChild(base);
    towerElement.appendChild(tankLeft);
    towerElement.appendChild(tankRight);
    towerElement.appendChild(gunContainer);
    tower.gunElement = gun;
    tower.crystalElement = crystal;
  } else if (type === "buff") {
    towerElement.style.backgroundColor = "transparent";
    towerElement.classList.add('buff-tower');
    towerElement.title = 'Torre de Amplificação de Energia';

    const base = document.createElement('div');
    base.className = 'tower-base buff-base';
    // Haste central
    const mast = document.createElement('div');
    mast.className = 'buff-mast';
    // Esfera brilhante
    const orb = document.createElement('div');
    orb.className = 'buff-orb';
    // Anel flutuante
    const ring = document.createElement('div');
    ring.className = 'buff-ring';
    // Pulso animado (ajustado pelo alcance)
    const pulse = document.createElement('div');
    pulse.className = 'buff-pulse';
    // Montagem
    towerElement.appendChild(base);
    towerElement.appendChild(mast);
    towerElement.appendChild(orb);
    towerElement.appendChild(ring);
    towerElement.appendChild(pulse);
    tower.mastElement = mast;
    tower.orbElement = orb;
    tower.ringElement = ring;
    tower.pulseElement = pulse;
    function updatePulseSize() {
      // Usa o mesmo valor do rangeCircle
      if (tower.rangeCircle) {
        pulse.style.width = tower.rangeCircle.style.width;
        pulse.style.height = tower.rangeCircle.style.height;
      } else {
        const range = getTowerRange(tower);
        pulse.style.width = (range * 2) + 'px';
        pulse.style.height = (range * 2) + 'px';
      }
      pulse.style.left = '50%';
      pulse.style.top = '50%';
      pulse.style.transform = 'translate(-50%, -50%)';
    }
    updatePulseSize();
    tower.updatePulseSize = updatePulseSize;
  } else if (type === "sniper") {
    towerElement.style.backgroundColor = "transparent";
    towerElement.classList.add('sniper-tower');
    towerElement.title = 'Torre de Precisão';

    const base = document.createElement('div');
    base.className = 'tower-base';
    const glow = document.createElement('div');
    glow.className = 'gun-glow';
    const gunContainer = document.createElement('div');
    gunContainer.className = 'gun-container sniper-gun-container';
    const gun = document.createElement('div');
    gun.className = 'tower-gun sniper-gun';
    const barrel = document.createElement('div');
    barrel.className = 'gun-barrel sniper-barrel';
    const tip = document.createElement('div');
    tip.className = 'barrel-tip sniper-tip';
    // Mira telescópica
    const scope = document.createElement('div');
    scope.className = 'sniper-scope';
    barrel.appendChild(scope);
    barrel.appendChild(tip);
    gun.appendChild(barrel);
    gunContainer.appendChild(gun);
    towerElement.appendChild(base);
    towerElement.appendChild(glow);
    towerElement.appendChild(gunContainer);
    tower.gunElement = gun;
    tower.barrelElement = barrel;
  }
  
  gameArea.appendChild(towerElement);
  
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
  towerElement.appendChild(levelText);
  tower.levelText = levelText;
  
  const rangeCircle = document.createElement('div');
  rangeCircle.className = 'tower-range';
  rangeCircle.style.position = 'absolute';
  rangeCircle.style.top = '50%';
  rangeCircle.style.left = '50%';
  rangeCircle.style.transform = 'translate(-50%, -50%)';
  rangeCircle.style.width = getTowerRange(tower) * 2 + 'px';
  rangeCircle.style.height = getTowerRange(tower) * 2 + 'px';
  
  switch(type) {
    case 'fast': rangeCircle.style.border = '1px solid yellow'; break;
    case 'aoe': rangeCircle.style.border = '1px solid orange'; break;
    case 'freeze': rangeCircle.style.border = '1px solid #00ccff'; break;
    case 'buff': 
      rangeCircle.style.border = '1px solid #33cc33';
      rangeCircle.style.background = 'rgba(51, 204, 51, 0.1)';
      break;
    case 'sniper': rangeCircle.style.border = '1px solid #8A2BE2'; break;
  }
  
  rangeCircle.style.borderRadius = '50%';
  rangeCircle.style.opacity = '0.2';
  rangeCircle.style.pointerEvents = 'none';
  towerElement.appendChild(rangeCircle);
  tower.rangeCircle = rangeCircle;
  
  const tooltip = document.createElement('div');
  tooltip.className = 'tower-tooltip';
  towerElement.appendChild(tooltip);
  tower.tooltip = tooltip;
  
  towerElement.style.cursor = 'pointer';
  towerElement.onclick = (e) => {
    e.stopPropagation();
    upgradeTowerAtSpot(tower);
  };
  towerElement.onmouseenter = () => {
    updateTowerTooltip(tower);
  };
  
  towerElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    hideRadialMenu();
    showSellMenu(e, tower);
  });
  
  builtTowers.push(tower);
  updateAllBuffEffects();
  drawPaths();
  return true;
}

// --- Funções do Menu de Venda ---
const sellMenu = document.getElementById('sellMenu');
let sellMenuActive = false;

function showSellMenu(event, tower) {
  const menuLeft = tower.x + pathsCanvas.offsetLeft - sellMenu.offsetWidth / 2;
  const menuTop = tower.y + pathsCanvas.offsetTop - sellMenu.offsetHeight - 10; // Posiciona acima da torre

  sellMenu.style.left = `${menuLeft}px`;
  sellMenu.style.top = `${menuTop}px`;
  sellMenu.style.display = 'block';
  sellMenu.innerHTML = ''; // Limpa antes de adicionar
  sellMenuActive = true;

  const sellBtn = document.createElement('div');
  sellBtn.className = 'sell-option';
  sellBtn.innerHTML = '🔨';
  sellBtn.title = 'Vender Torre';
  sellBtn.onclick = (e) => {
    e.stopPropagation();
    sellTower(tower);
    hideSellMenu();
  };
  
  sellMenu.appendChild(sellBtn);
}

function hideSellMenu() {
  if (!sellMenuActive) return;
  sellMenu.style.display = 'none';
  sellMenu.innerHTML = '';
  sellMenuActive = false;
}

function sellTower(tower) {
  let totalCost = 0;
  // Soma os custos de todos os níveis até o atual
  for (let i = 0; i < tower.level; i++) {
    totalCost += TOWER_UPGRADE_COSTS[i];
  }

  const refund = Math.ceil((totalCost * 0.3) / 10) * 10;
  
  gold += refund;
  goldDisplay.textContent = gold;
  localStorage.setItem("gold", gold);

  // Remove a torre do array
  const towerIndex = builtTowers.findIndex(t => t === tower);
  if (towerIndex > -1) {
    builtTowers.splice(towerIndex, 1);
  }

  // Libera o local de construção
  allBuildSpots[tower.spotPathIdx][tower.spotIdx].tower = null;

  // Remove o elemento da torre do DOM
  tower.element.remove();

  // Redesenha os caminhos para mostrar o local vazio
  updateAllBuffEffects();
  drawPaths();
}

// Esconder menus ao clicar fora
window.addEventListener('click', function(e) {
  if (radialMenuActive && !radialMenu.contains(e.target)) {
    hideRadialMenu();
  }
  if (sellMenuActive && !sellMenu.contains(e.target)) {
    // Verifica se o clique não foi numa torre, para não fechar ao tentar abrir
    if (!e.target.classList.contains('tower')) {
      hideSellMenu();
    }
  }
});

// Função utilitária para atualizar todos os buffs visuais e aplicar o maior buffFactor
function updateAllBuffEffects() {
  // 1. Marcar todas as torres como não buffadas e buffFactor 0
  for (const tower of builtTowers) {
    tower._buffedBy = 0;
    tower.buffFactor = 0;
  }
  // 2. Para cada torre amplificadora, marcar as torres dentro do alcance e calcular o maior buffFactor
  for (const buffTower of builtTowers) {
    if (buffTower.type !== 'buff') continue;
    const buffRange = getTowerRange(buffTower);
    const buffFactor = 0.2 + (buffTower.level - 1) * 0.1;
    for (const tower of builtTowers) {
      if (tower === buffTower || tower.type === 'buff') continue;
      const dx = buffTower.x - tower.x;
      const dy = buffTower.y - tower.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < buffRange) {
        tower._buffedBy = (tower._buffedBy || 0) + 1;
        if (!tower.buffFactor || buffFactor > tower.buffFactor) {
          tower.buffFactor = buffFactor;
        }
      }
    }
  }
  // 3. Aplicar/remover efeito visual conforme necessário
  for (const tower of builtTowers) {
    if (tower._buffedBy > 0) {
      if (!tower.buffEffect) {
        tower.buffEffect = document.createElement('div');
        tower.buffEffect.className = 'buff-effect';
        // Inserir depois da base, se existir
        const base = tower.element.querySelector('.tower-base');
        if (base && base.nextSibling) {
          tower.element.insertBefore(tower.buffEffect, base.nextSibling);
        } else {
          tower.element.appendChild(tower.buffEffect);
        }
      }
    } else {
      if (tower.buffEffect) {
        tower.buffEffect.remove();
        tower.buffEffect = null;
      }
      tower.buffFactor = 0;
    }
  }
} 