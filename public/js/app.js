// ============================================
// GLOBAL STATE
// ============================================
const API_BASE = 'http://localhost:3000/api';

// ============================================
// HELPERS
// ============================================
function createBlockState(id) {
    return {
        id: id,
        active: false,
        // Core 4 inputs
        budget: null,
        campaignCycle: null,
        taxonomia: null,
        praca: null,
        // Ideal plan (from backend)
        idealPlan: null,
        // Manual adjustments (user edits)
        manualPlan: null,
        // Efficiency metrics
        efficiencyMetrics: null,
        // Final player list
        playerList: null
    };
}

function getBlockById(id) {
    return state.mediaBlocks.find(b => b.id === Number(id));
}

function addBlock() {
    const newId = state.nextBlockId++;
    const newBlock = createBlockState(newId);
    state.mediaBlocks.push(newBlock);
    renderMediaBlocks();
}

function removeBlock(blockId) {
    // Se for o último bloco, apenas reseta
    if (state.mediaBlocks.length <= 1) {
        resetBlock(blockId);
        return;
    }

    if (!confirm('Tem certeza que deseja remover este recorte de mídia?')) return;

    state.mediaBlocks = state.mediaBlocks.filter(b => b.id !== Number(blockId));
    renderMediaBlocks();
    updateConsolidated();
}

const state = {
    filters: {},
    nextBlockId: 2,
    mediaBlocks: [createBlockState(1)]
};

// ============================================
// INITIALIZATION
// ============================================
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();

        if (!data.authenticated) {
            window.location.href = '/login.html';
            return false;
        }
        return true;
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando OOH Planner...');

    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;

    try {
        setupEventListeners();
        await loadFilters();

        const urlParams = new URLSearchParams(window.location.search);
        const planId = urlParams.get('planId');

        if (planId) {
            await loadPlan(planId);
        } else {
            renderMediaBlocks();
        }

        console.log('✅ Aplicação inicializada com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao inicializar:', err);
        showError('Erro ao inicializar aplicação. Verifique se o servidor está rodando.');
    }
});

// ============================================
// API CALLS
// ============================================
async function loadFilters() {
    try {
        const response = await fetch(`${API_BASE}/filters`);
        if (!response.ok) throw new Error('Erro ao carregar filtros');

        state.filters = await response.json();
        console.log('📋 Filtros carregados:', state.filters);
    } catch (err) {
        console.error('Erro ao carregar filtros:', err);
        throw err;
    }
}

async function fetchIdealPlan(blockId) {
    const block = getBlockById(blockId);

    // Validate all 4 core inputs are present
    if (!block.budget || !block.campaignCycle || !block.taxonomia || !block.praca) {
        block.idealPlan = null;
        block.active = false;
        updateBlockUI(blockId);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/get-ideal-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                budget: block.budget,
                campaignCycle: block.campaignCycle,
                taxonomia: block.taxonomia,
                praca: block.praca
            })
        });

        if (!response.ok) throw new Error('Erro ao buscar plano ideal');

        const idealPlan = await response.json();

        if (idealPlan.status === 'error') {
            block.idealPlan = null;
            block.active = false;
            showBlockMessage(blockId, idealPlan.message, 'error');
        } else {
            block.idealPlan = idealPlan;
            block.active = true;

            // Initialize manual plan with ideal quantities
            block.manualPlan = {
                formats: idealPlan.formats.map(f => ({
                    name: f.name,
                    adjustedQty: f.recommendedQty
                }))
            };

            // Calculate initial efficiency (should be 100%)
            await calculateEfficiency(blockId);
        }

        updateBlockUI(blockId);
        updateConsolidated();

    } catch (err) {
        console.error(`Erro ao buscar plano ideal do bloco ${blockId}:`, err);
        block.idealPlan = null;
        block.active = false;
        showBlockMessage(blockId, 'Erro de conexão ao buscar plano ideal', 'error');
        updateBlockUI(blockId);
    }
}

async function calculateEfficiency(blockId) {
    const block = getBlockById(blockId);

    if (!block.idealPlan || !block.manualPlan) {
        block.efficiencyMetrics = null;
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/calculate-efficiency`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                manualPlan: block.manualPlan,
                idealPlan: block.idealPlan
            })
        });

        if (!response.ok) throw new Error('Erro ao calcular eficiência');

        const efficiency = await response.json();
        block.efficiencyMetrics = efficiency;

        updateEfficiencyUI(blockId);

    } catch (err) {
        console.error(`Erro ao calcular eficiência do bloco ${blockId}:`, err);
        block.efficiencyMetrics = null;
    }
}

async function generatePlayerList(blockId) {
    const block = getBlockById(blockId);

    if (!block.idealPlan || !block.manualPlan) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/get-player-list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                manualPlan: block.manualPlan,
                idealPlan: block.idealPlan
            })
        });

        if (!response.ok) throw new Error('Erro ao gerar lista de players');

        const result = await response.json();
        block.playerList = result.playerList;

        updatePlayerListUI(blockId);

    } catch (err) {
        console.error(`Erro ao gerar lista de players do bloco ${blockId}:`, err);
        block.playerList = null;
    }
}

// ============================================
// UI GENERATION
// ============================================
function renderMediaBlocks() {
    const container = document.getElementById('mediaBlocks');
    const template = document.getElementById('mediaBlockTemplate');
    container.innerHTML = '';

    state.mediaBlocks.forEach((blockState, index) => {
        const clone = template.content.cloneNode(true);
        const block = clone.querySelector('.media-block');
        block.dataset.blockId = blockState.id;

        // Update block number
        clone.querySelector('.number-badge').textContent = index + 1;
        clone.querySelector('.config-label').textContent = `CONFIGURAÇÃO TÉCNICA #${String(index + 1).padStart(2, '0')}`;

        // Populate taxonomia and praça selects
        populateCoreSelects(block);

        // Restore values if they exist
        if (blockState.budget) block.querySelector('.input-budget').value = blockState.budget;
        if (blockState.campaignCycle) block.querySelector('.input-campaign-cycle').value = blockState.campaignCycle;
        if (blockState.taxonomia) block.querySelector('.input-taxonomia').value = blockState.taxonomia;
        if (blockState.praca) block.querySelector('.input-praca').value = blockState.praca;

        // Setup event listeners
        setupBlockListeners(block, blockState.id);

        // If block has data, update UI
        if (blockState.idealPlan) updateBlockUI(blockState.id);

        container.appendChild(clone);
    });
}

function populateCoreSelects(blockElement) {
    // Populate Taxonomia
    const taxonomiaSelect = blockElement.querySelector('.input-taxonomia');
    if (state.filters.taxonomia) {
        state.filters.taxonomia.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            taxonomiaSelect.appendChild(option);
        });
    }

    // Populate Praça
    const pracaSelect = blockElement.querySelector('.input-praca');
    if (state.filters.praca) {
        state.filters.praca.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            pracaSelect.appendChild(option);
        });
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupBlockListeners(blockElement, blockId) {
    // Core inputs
    const budgetInput = blockElement.querySelector('.input-budget');
    budgetInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        getBlockById(blockId).budget = isNaN(value) ? null : value;
        fetchIdealPlan(blockId);
    });

    const cycleInput = blockElement.querySelector('.input-campaign-cycle');
    cycleInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        getBlockById(blockId).campaignCycle = isNaN(value) ? null : value;
        fetchIdealPlan(blockId);
    });

    const taxonomiaSelect = blockElement.querySelector('.input-taxonomia');
    taxonomiaSelect.addEventListener('change', (e) => {
        getBlockById(blockId).taxonomia = e.target.value || null;
        fetchIdealPlan(blockId);
    });

    const pracaSelect = blockElement.querySelector('.input-praca');
    pracaSelect.addEventListener('change', (e) => {
        getBlockById(blockId).praca = e.target.value || null;
        fetchIdealPlan(blockId);
    });

    // Delete button
    const deleteBtn = blockElement.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', () => removeBlock(blockId));

    // Generate player list button (will be added dynamically)
    // Event delegation handled in updateBlockUI
}

function setupEventListeners() {
    document.getElementById('btnResetAll').addEventListener('click', resetAll);
    document.getElementById('btnExport').addEventListener('click', exportCSV);

    const btnStore = document.getElementById('btnStore');
    if (btnStore) {
        btnStore.addEventListener('click', storeToBigQuery);
    }

    const btnSavePlan = document.getElementById('btnSavePlan');
    if (btnSavePlan) {
        btnSavePlan.addEventListener('click', savePlan);
    }
}

// ============================================
// UI UPDATES
// ============================================
function updateBlockUI(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement) return;

    const statusBadge = blockElement.querySelector('.status-badge');
    const idealPlanSection = blockElement.querySelector('.ideal-plan-section');
    const manualAdjustmentSection = blockElement.querySelector('.manual-adjustment-section');
    const messageDiv = blockElement.querySelector('.block-message');

    // Hide all sections initially
    idealPlanSection.style.display = 'none';
    manualAdjustmentSection.style.display = 'none';
    messageDiv.style.display = 'none';

    if (!block.idealPlan || !block.active) {
        statusBadge.textContent = 'INATIVO';
        statusBadge.classList.add('inactive');
        statusBadge.classList.remove('active');
        return;
    }

    // Show active state
    statusBadge.textContent = 'ATIVO';
    statusBadge.classList.remove('inactive');
    statusBadge.classList.add('active');

    // Display ideal plan
    idealPlanSection.style.display = 'block';
    updateIdealPlanUI(blockElement, block.idealPlan);

    // Display manual adjustment section
    manualAdjustmentSection.style.display = 'block';
    updateManualAdjustmentUI(blockElement, blockId);
}

function updateIdealPlanUI(blockElement, idealPlan) {
    // Update summary metrics
    blockElement.querySelector('.ideal-total-faces').textContent = idealPlan.totalFaces || 0;
    blockElement.querySelector('.ideal-total-cost').textContent = formatCurrency(idealPlan.totalCost);
    blockElement.querySelector('.ideal-total-exposure').textContent = formatExposure(idealPlan.totalExposure);

    // Update formats grid
    const formatsGrid = blockElement.querySelector('.ideal-formats-grid');
    formatsGrid.innerHTML = '';

    idealPlan.formats.forEach(format => {
        const card = document.createElement('div');
        card.className = 'ideal-format-card';
        card.innerHTML = `
            <div class="format-name">${format.name}</div>
            <div class="format-qty">${format.recommendedQty} faces</div>
            <div class="format-cost">${formatCurrency(format.totalCost)}</div>
        `;
        formatsGrid.appendChild(card);
    });
}

function updateManualAdjustmentUI(blockElement, blockId) {
    const block = getBlockById(blockId);
    const grid = blockElement.querySelector('.manual-adjustment-grid');
    grid.innerHTML = '';

    if (!block.manualPlan) return;

    block.manualPlan.formats.forEach((format, index) => {
        const idealFormat = block.idealPlan.formats.find(f => f.name === format.name);

        const adjustmentCard = document.createElement('div');
        adjustmentCard.className = 'manual-adjustment-card';
        adjustmentCard.innerHTML = `
            <div class="adjustment-label">${format.name}</div>
            <div class="adjustment-input-group">
                <label>Ideal: ${idealFormat?.recommendedQty || 0}</label>
                <input type="number" 
                       class="form-control adjustment-input" 
                       value="${format.adjustedQty}" 
                       min="0" 
                       data-format-index="${index}">
            </div>
        `;

        const input = adjustmentCard.querySelector('.adjustment-input');
        input.addEventListener('input', (e) => {
            const newQty = parseInt(e.target.value) || 0;
            block.manualPlan.formats[index].adjustedQty = newQty;

            // Existing: Calculate efficiency
            calculateEfficiency(blockId);

            // NEW: Auto-regenerate player list
            if (block.playerList) {
                generatePlayerList(blockId);
            }
        });

        grid.appendChild(adjustmentCard);
    });

    // Setup generate player list button
    const generateBtn = blockElement.querySelector('.btn-generate-list');
    generateBtn.onclick = () => generatePlayerList(blockId);
}

function updateEfficiencyUI(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement || !block.efficiencyMetrics) return;

    const efficiencySection = blockElement.querySelector('.efficiency-section');
    efficiencySection.style.display = 'block';

    // Update comparison card values
    blockElement.querySelector('.ideal-efficiency-value').textContent =
        block.efficiencyMetrics.idealEfficiency.toFixed(2);
    blockElement.querySelector('.manual-efficiency-value').textContent =
        block.efficiencyMetrics.manualEfficiency.toFixed(2);

    // Update slider values
    blockElement.querySelector('.ideal-efficiency-slider-value').textContent =
        block.efficiencyMetrics.manualEfficiency.toFixed(2);
    blockElement.querySelector('.exposure-slider-value').textContent =
        formatExposure(block.efficiencyMetrics.manualTotalExposure);

    // Update efficiency slider cursor
    const efficiencyCursor = blockElement.querySelector('.efficiency-cursor');
    const manualEff = block.efficiencyMetrics.manualEfficiency;
    const idealEff = block.efficiencyMetrics.idealEfficiency;

    // Scale: 0 to 2x ideal efficiency (0% to 100%)
    const maxScale = idealEff * 2;
    const effPercent = Math.min(Math.max((manualEff / maxScale) * 100, 0), 100);
    efficiencyCursor.style.left = `${effPercent}%`;

    // Update exposure slider cursor
    const exposureCursor = blockElement.querySelector('.exposure-cursor');
    const manualExposure = block.efficiencyMetrics.manualTotalExposure;
    const idealExposure = block.idealPlan?.totalExposure || 0;

    // Scale: 0 to 2x ideal exposure (0% to 100%)
    const maxExposureScale = idealExposure * 2;
    const expPercent = Math.min(Math.max((manualExposure / maxExposureScale) * 100, 0), 100);
    exposureCursor.style.left = `${expPercent}%`;

    // Update efficiency bar
    const efficiencyFill = blockElement.querySelector('.efficiency-fill');
    const efficiencyStatus = blockElement.querySelector('.efficiency-status');

    const percentage = block.efficiencyMetrics.percentageOfIdeal;
    efficiencyFill.style.width = `${Math.min(percentage, 100)}%`;

    // Color coding
    if (block.efficiencyMetrics.status === 'efficient') {
        efficiencyFill.style.backgroundColor = '#10b981';
    } else if (block.efficiencyMetrics.status === 'acceptable') {
        efficiencyFill.style.backgroundColor = '#f59e0b';
    } else {
        efficiencyFill.style.backgroundColor = '#ef4444';
    }

    efficiencyStatus.textContent = block.efficiencyMetrics.statusMessage;
}

function updatePlayerListUI(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement || !block.playerList) return;

    const playerListSection = blockElement.querySelector('.player-list-section');
    playerListSection.style.display = 'block';

    const tbody = blockElement.querySelector('.player-list-body');
    tbody.innerHTML = '';

    block.playerList.forEach((player, index) => {
        // Determine discount color
        let discountClass = '';
        let discountText = '--';

        if (player.discount !== undefined && player.discount !== null) {
            const discount = parseFloat(player.discount);
            if (discount > 0) {
                discountClass = 'discount-positive'; // Green - got discount
                discountText = `+${discount.toFixed(1)}%`;
            } else if (discount < 0) {
                discountClass = 'discount-negative'; // Red - paying premium
                discountText = `${discount.toFixed(1)}%`;
            } else {
                discountClass = 'discount-neutral'; // Gray - equal
                discountText = '0%';
            }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${player.praca || '--'}</td>
            <td>${player.uf || '--'}</td>
            <td>${player.exibidores || '--'}</td>
            <td>${player.formato || '--'}</td>
            <td class="qty-ideal">${player.idealQuantity || '--'}</td>
            <td class="qty-negotiated">${player.negotiatedQuantity || '--'}</td>
            <td class="${discountClass}">${discountText}</td>
            <td>${formatCurrency(player.unitPrice)}</td>
            <td><strong>${formatCurrency(player.totalCost)}</strong></td>
            <td><span class="roi-badge">${player.roi}</span></td>
        `;
        tbody.appendChild(row);
    });

    // Setup CSV export button
    const exportBtn = blockElement.querySelector('.btn-export-csv');
    exportBtn.onclick = () => exportPlayerListToCSV(blockId);
}

function exportPlayerListToCSV(blockId) {
    const block = getBlockById(blockId);
    if (!block.playerList || block.playerList.length === 0) {
        alert('Nenhum dado para exportar');
        return;
    }

    // CSV headers
    const headers = ['#', 'Praça', 'UF', 'Exibidores', 'Formato', 'Qtd Ideal', 'Qtd Negociada', 'Desconto %', 'Preço Un.', 'Total', 'ROI'];

    // CSV rows
    const rows = block.playerList.map((player, index) => [
        index + 1,
        player.praca || '',
        player.uf || '',
        player.exibidores || '',
        player.formato || '',
        player.idealQuantity || '',
        player.negotiatedQuantity || '',
        player.discount !== undefined ? player.discount.toFixed(1) + '%' : '',
        player.unitPrice.toFixed(2),
        player.totalCost.toFixed(2),
        player.roi
    ]);

    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `player_list_block_${blockId}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function updateConsolidated() {
    // Update total card
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.efficiencyMetrics);
    const totalCard = activeBlocks.reduce((sum, b) => sum + (b.efficiencyMetrics?.manualTotalCost || 0), 0);

    document.getElementById('totalCard').textContent = formatCurrency(totalCard);

    // Update global efficiency indicators
    const totalExposure = activeBlocks.reduce((sum, b) => sum + (b.efficiencyMetrics?.manualTotalExposure || 0), 0);
    const globalEfficiency = totalCard > 0 ? totalExposure / totalCard : 0;

    const eficienciaValue = document.getElementById('eficienciaValue');
    const eficienciaCursor = document.getElementById('eficienciaCursor');

    if (eficienciaValue) eficienciaValue.textContent = globalEfficiency.toFixed(2);

    if (eficienciaCursor) {
        const eff = Math.min(Math.max(globalEfficiency, 0), 2.0);
        const percent = (eff / 2.0) * 100;
        eficienciaCursor.style.left = `${percent}%`;
    }

    // Update exposure indicator
    const exposicaoValue = document.getElementById('exposicaoValue');
    const exposicaoCursor = document.getElementById('exposicaoCursor');

    if (exposicaoValue) {
        const millions = totalExposure / 1000000;
        exposicaoValue.textContent = millions > 0 ? millions.toFixed(1) + 'M' : '0';
    }

    if (exposicaoCursor) {
        const maxScale = 12000000;
        const exp = Math.min(Math.max(totalExposure, 0), maxScale);
        const percent = (exp / maxScale) * 100;
        exposicaoCursor.style.left = `${percent}%`;
    }

    // Update consolidated table
    const tbody = document.getElementById('consolidatedTableBody');
    tbody.innerHTML = '';

    if (activeBlocks.length === 0) {
        tbody.innerHTML = '<tr class="empty-state"><td colspan="12">Nenhuma mídia configurada ainda</td></tr>';
    } else {
        activeBlocks.forEach(block => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Mídia ${block.id}</td>
                <td>${block.idealPlan?.praca || '--'}</td>
                <td>${block.idealPlan?.taxonomia || '--'}</td>
                <td>${block.manualPlan?.formats.length || 0} formatos</td>
                <td>${formatCurrency(block.budget)}</td>
                <td>${formatCurrency(block.efficiencyMetrics?.manualTotalCost || 0)}</td>
                <td>${formatCurrency(block.idealPlan?.totalCost || 0)}</td>
                <td>${block.efficiencyMetrics?.percentageOfIdeal || 0}%</td>
                <td><span class="status-badge">${block.efficiencyMetrics?.status === 'efficient' ? '✅' : block.efficiencyMetrics?.status === 'acceptable' ? '⚠️' : '❌'}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
}

function showBlockMessage(blockId, message, type = 'info') {
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement) return;

    const messageDiv = blockElement.querySelector('.block-message');
    messageDiv.textContent = message;
    messageDiv.className = `block-message ${type}`;
    messageDiv.style.display = 'block';
}

// ============================================
// ACTIONS
// ============================================
function resetBlock(blockId) {
    const block = getBlockById(blockId);

    block.budget = null;
    block.campaignCycle = null;
    block.taxonomia = null;
    block.praca = null;
    block.idealPlan = null;
    block.manualPlan = null;
    block.efficiencyMetrics = null;
    block.playerList = null;
    block.active = false;

    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (blockElement) {
        blockElement.querySelectorAll('input').forEach(input => input.value = '');
        blockElement.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
    }

    updateBlockUI(blockId);
    updateConsolidated();
}

function resetAll() {
    if (!confirm('Tem certeza que deseja resetar tudo? Isso removerá todos os blocos.')) return;

    state.mediaBlocks = [createBlockState(1)];
    state.nextBlockId = 2;
    renderMediaBlocks();
    updateConsolidated();
}

async function savePlan() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active);

    if (activeBlocks.length === 0) {
        alert('❌ Nenhuma mídia configurada para salvar');
        return;
    }

    const planName = prompt("Digite um nome para este plano:", "Meu Plano");
    if (!planName) return;

    try {
        const response = await fetch(`${API_BASE}/plans`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: planName,
                data: state.mediaBlocks
            })
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Plano '${planName}' salvo com sucesso!`);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Erro ao salvar plano:', error);
        alert('❌ Erro ao salvar plano: ' + error.message);
    }
}

async function storeToBigQuery() {
    alert('Funcionalidade de armazenamento no BigQuery será adaptada para o novo formato em breve.');
}

function exportCSV() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.playerList);

    if (activeBlocks.length === 0) {
        alert('Nenhuma mídia configurada para exportar');
        return;
    }

    // Summary section
    const summaryHeaders = ['Mídia', 'Budget', 'Ciclo', 'Taxonomia', 'Praça', 'Plano Ideal (Faces)', 'Plano Ajustado (Faces)', 'Eficiência (%)', 'Status'];
    const summaryRows = activeBlocks.map(block => [
        `Mídia ${block.id}`,
        formatCurrency(block.budget),
        block.campaignCycle,
        block.taxonomia,
        block.praca,
        block.idealPlan?.totalFaces || 0,
        block.manualPlan?.formats.reduce((sum, f) => sum + f.adjustedQty, 0) || 0,
        block.efficiencyMetrics?.percentageOfIdeal || 0,
        block.efficiencyMetrics?.status || '-'
    ]);

    // Player list details
    const detailsHeaders = ['Mídia', 'Prioridade', 'Praça', 'UF', 'Exibidores', 'Formato', 'Qtd', 'Preço Unitário', 'Total', 'ROI'];
    const detailsRows = [];

    activeBlocks.forEach(block => {
        if (block.playerList) {
            block.playerList.forEach((player, index) => {
                detailsRows.push([
                    `Mídia ${block.id}`,
                    index + 1,
                    player.praca || '-',
                    player.uf || '-',
                    player.exibidores || '-',
                    player.formato || '-',
                    player.quantity,
                    formatCurrency(player.unitPrice),
                    formatCurrency(player.totalCost),
                    player.roi
                ]);
            });
        }
    });

    // Generate CSV
    let csv = '';
    csv += '=== RESUMO DOS BLOCOS DE MÍDIA ===\n';
    csv += [summaryHeaders, ...summaryRows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    csv += '\n\n';

    if (detailsRows.length > 0) {
        csv += '=== LISTA DE PLAYERS (DETALHADO) ===\n';
        csv += [detailsHeaders, ...detailsRows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');
    }

    // Download
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `plano_ooh_${timestamp}.csv`;

    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);

    setTimeout(() => {
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 500);
    }, 50);

    console.log(`✅ CSV exportado: ${activeBlocks.length} blocos`);
}

async function loadPlan(planId) {
    try {
        console.log(`Loading plan ${planId}...`);
        const response = await fetch(`${API_BASE}/plans/${planId}`);

        if (!response.ok) {
            throw new Error('Plan not found or access denied');
        }

        const data = await response.json();

        if (data.success && data.plan) {
            console.log('Plan data loaded:', data.plan);

            state.mediaBlocks = data.plan.data;

            state.mediaBlocks.forEach((block, index) => {
                if (!block.id) block.id = index + 1;
            });

            const maxId = Math.max(...state.mediaBlocks.map(b => b.id), 0);
            state.nextBlockId = maxId + 1;

            renderMediaBlocks();
            updateConsolidated();

            window.history.replaceState({}, document.title, "/");

            console.log('✅ Plan loaded successfully');
        }
    } catch (err) {
        console.error('Error loading plan:', err);
        showError('Erro ao carregar o plano. Ele pode ter sido excluído.');
        renderMediaBlocks();
    }
}

// ============================================
// UTILITIES
// ============================================
function formatCurrency(value) {
    if (value === null || value === undefined) return '--';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

function formatExposure(value) {
    if (!value) return '0';
    const millions = value / 1000000;
    return millions.toFixed(1) + 'M';
}

function showError(message) {
    alert(message);
}
