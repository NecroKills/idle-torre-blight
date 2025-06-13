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
    // Aplica a transformação ao contêiner principal do jogo
    // Usamos o 'gameArea' que já foi definido como document.getElementById('game')
    gameArea.style.transformOrigin = '0 0';
    gameArea.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}


// Estado inicial
let gold = 300; // Ouro inicial sempre 300
let wave = 0; // Não usaremos mais o sistema de ondas

function hideRadialMenu() {
  radialMenu.style.display = 'none';
  radialMenu.innerHTML = '';
  radialMenuActive = false;
  radialMenuSpot = null;
}

// --- Funções de Câmera e Coordenadas ---
function screenToWorld(clientX, clientY) {
    // Pega as dimensões e a posição do contêiner do jogo na tela
    const rect = gameArea.getBoundingClientRect();
    
    // Calcula a posição do mouse relativa ao canto superior esquerdo do contêiner
    // Isso nos dá a posição como se estivéssemos clicando no elemento já transformado
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;

    // Converte a posição relativa de volta para as coordenadas do "mundo" (antes da transformação)
    // dividindo pela escala atual.
    const worldX = relativeX / scale;
    const worldY = relativeY / scale;

    return { x: worldX, y: worldY };
}


// Esconder menu ao clicar fora
window.addEventListener('click', function(e) {
    // Adicionar listeners para os botões
    pauseBtn.addEventListener('click', togglePause);
    helpBtn.addEventListener('click', showHelp);
    nextRaidBtn.addEventListener('click', nextRaid);

    // --- EVENT LISTENERS PARA ZOOM E PAN ---

    // Listener para o ZOOM (roda do mouse)
    // Usamos 'gameArea' como alvo para garantir que funcione em todo o espaço do jogo
    gameArea.addEventListener('wheel', (event) => {
        event.preventDefault();

        const rect = gameArea.getBoundingClientRect();
        // Posição do mouse relativa ao contêiner do jogo
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Posição do "mundo" sob o mouse ANTES do zoom
        const worldXBeforeZoom = mouseX / scale;
        const worldYBeforeZoom = mouseY / scale;

        // Calcula a nova escala
        const scaleAmount = -event.deltaY * 0.001;
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * (1 + scaleAmount)));

        // Posição do "mundo" sob o mouse DEPOIS do zoom
        const worldXAfterZoom = mouseX / scale;
        const worldYAfterZoom = mouseY / scale;

        // Ajusta o offset para que o zoom pareça vir do ponto do mouse
        offsetX += (worldXAfterZoom - worldXBeforeZoom) * -scale;
        offsetY += (worldYAfterZoom - worldYBeforeZoom) * -scale;

        updateGameTransform();
    }, { passive: false });

    // Listeners para o PAN (arrastar)
    gameArea.addEventListener('mousedown', (event) => {
        // Permite arrastar com o botão do meio, direito, ou Ctrl + esquerdo
        if (event.button === 1 || event.button === 2 || (event.button === 0 && event.ctrlKey)) {
            isDragging = true;
            // Armazena a posição inicial do mouse para calcular o delta
            lastMousePosition = { x: event.clientX, y: event.clientY };
            gameArea.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (event) => {
        if (isDragging) {
            // Calcula o quanto o mouse se moveu
            const dx = event.clientX - lastMousePosition.x;
            const dy = event.clientY - lastMousePosition.y;

            // Adiciona o delta ao offset
            offsetX += dx;
            offsetY += dy;

            // Atualiza a posição para o próximo movimento
            lastMousePosition = { x: event.clientX, y: event.clientY };

            updateGameTransform();
        }
    });

    const stopDragging = () => {
        isDragging = false;
        gameArea.style.cursor = 'default';
    };

    window.addEventListener('mouseup', stopDragging);
    // Também para de arrastar se o mouse sair da janela
    window.addEventListener('mouseleave', stopDragging);
}); 