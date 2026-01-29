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
        budget: null,              // NEW: Primary input
        campaignCycle: null,       // NEW: Secondary input
        filters: {                 // Now optional
            uf: 'Tudo',
            praca: 'Tudo',
            taxonomia: 'Tudo',
            exibidores: 'Tudo',
            formato: 'Tudo',
            regional_boticario: 'Tudo',
            cluster_exibidores: 'Tudo',
            cluster_formato: 'Tudo',
            periodicidade: 'Tudo',
            flight: 'Tudo',
            digital: false,
            estatico: false
        },
        optimizationResult: null   // NEW: Replaces 'result'
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
    pracaToUfMap: {},  // Mapeamento de praça para UF
    nextBlockId: 2, // ID counter for new blocks
    mediaBlocks: [createBlockState(1)]
};

// ============================================
// INITIALIZATION
// ============================================
// Função para verificar autenticação
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

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando OOH Planner...');

    // Verificar autenticação antes de carregar dados
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;

    try {
        // Setup event listeners
        setupEventListeners();

        // Carregar filtros disponíveis
        await loadFilters();

        // Check for plan to load
        const urlParams = new URLSearchParams(window.location.search);
        const planId = urlParams.get('planId');

        if (planId) {
            await loadPlan(planId);
        } else {
            // Renderizar blocos iniciais
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

        // Construir mapeamento de praça para UF
        await buildPracaToUfMap();

        console.log('📋 Filtros carregados:', state.filters);
        console.log('🗺️  Mapeamento Praça→UF:', state.pracaToUfMap);
    } catch (err) {
        console.error('Erro ao carregar filtros:', err);
        throw err;
    }
}

/**
 * Constrói um mapeamento de praça para UF consultando o inventário
 */
async function buildPracaToUfMap() {
    try {
        // Buscar dados do inventário para criar o mapeamento
        const response = await fetch(`${API_BASE}/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters: {} })
        });

        if (!response.ok) return;

        const inventory = await response.json();

        // Criar mapeamento único de praça → UF
        const map = {};
        inventory.forEach(item => {
            if (item.praca && item.uf) {
                // Normalizar para lowercase para comparação case-insensitive
                const pracaKey = item.praca.toLowerCase();
                if (!map[pracaKey]) {
                    map[pracaKey] = item.uf;
                }
            }
        });

        state.pracaToUfMap = map;
    } catch (err) {
        console.error('Erro ao construir mapeamento praça→UF:', err);
    }
}

async function optimizeBudget(blockId) {
    const block = getBlockById(blockId);

    // Don't calculate if primary inputs are missing
    if (!block.budget || !block.campaignCycle) {
        block.optimizationResult = null;
        block.active = false;
        updateBlockUI(blockId);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/optimize-budget`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                budget: block.budget,
                campaignCycle: block.campaignCycle,
                filters: block.filters
            })
        });

        if (!response.ok) throw new Error('Erro ao otimizar budget');

        const result = await response.json();
        block.optimizationResult = result;
        block.active = result.status !== 'error';

        updateBlockUI(blockId);
        updateConsolidated();

    } catch (err) {
        console.error(`Erro ao otimizar budget do bloco ${blockId}:`, err);
        block.optimizationResult = { status: 'error', message: 'Erro de conexão' };
        block.active = false;
        updateBlockUI(blockId);
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

        // Atualizar número do bloco (visual sequencial)
        clone.querySelector('.number-badge').textContent = index + 1;
        clone.querySelector('.config-label').textContent = `CONFIGURAÇÃO TÉCNICA #${String(index + 1).padStart(2, '0')}`;

        // Preencher filtros
        populateFilters(block, blockState.id);

        // Restore static filters (Digital/Estatico checkboxes)
        const digitalCheckbox = block.querySelector('.filter-digital-checkbox');
        if (digitalCheckbox) {
            digitalCheckbox.checked = blockState.filters.digital === true;
        }

        const estaticoCheckbox = block.querySelector('.filter-estatico-checkbox');
        if (estaticoCheckbox) {
            estaticoCheckbox.checked = blockState.filters.estatico === true;
        }

        // Restore budget and campaign cycle values
        if (blockState.budget) block.querySelector('.input-budget').value = blockState.budget;
        if (blockState.campaignCycle) block.querySelector('.input-campaign-cycle').value = blockState.campaignCycle;

        // Event listeners
        setupBlockListeners(block, blockState.id);

        // Se já tiver resultado, atualizar UI
        if (blockState.optimizationResult) updateBlockUI(blockState.id);

        container.appendChild(clone);
    });
}

function populateFilters(blockElement, blockId, availableFilters = null) {
    const filtersToPopulate = ['uf', 'regional_boticario', 'praca', 'taxonomia', 'cluster_exibidores', 'exibidores', 'cluster_formato', 'formato', 'periodicidade', 'flight'];
    const currentFilters = getBlockById(blockId).filters;
    const sourceFilters = availableFilters || state.filters;

    filtersToPopulate.forEach(filterName => {
        const select = blockElement.querySelector(`.filter-${filterName}`);
        if (!select) return;

        const currentValue = currentFilters[filterName];

        // Limpar opções exceto "Tudo"
        select.innerHTML = '<option value="Tudo">Tudo</option>';

        const options = sourceFilters[filterName] || [];
        options.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            select.appendChild(option);
        });

        // Check if current value exists in options
        if (currentValue && currentValue !== 'Tudo' && !options.includes(currentValue)) {
            // Force add the value if it's missing (keeps UI consistent with state)
            const option = document.createElement('option');
            option.value = currentValue;
            option.textContent = currentValue;
            select.appendChild(option);
        }

        // Always restore the proper value
        if (currentValue) {
            select.value = currentValue;
        } else {
            select.value = 'Tudo';
        }
    });
}

/**
 * Atualiza os filtros disponíveis baseado nas seleções atuais do bloco
 */
async function updateAvailableFilters(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement) return;

    try {
        const response = await fetch(`${API_BASE}/filters/available`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters: block.filters })
        });

        if (!response.ok) throw new Error('Erro ao buscar filtros disponíveis');

        const availableFilters = await response.json();

        // Atualiza o UI sem disparar novos eventos de change (populateFilters faz isso)
        populateFilters(blockElement, blockId, availableFilters);

    } catch (err) {
        console.error(`Erro ao atualizar filtros para bloco ${blockId}:`, err);
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupBlockListeners(blockElement, blockId) {
    // Primary inputs: Budget and Campaign Cycle
    const budgetInput = blockElement.querySelector('.input-budget');
    budgetInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        getBlockById(blockId).budget = isNaN(value) ? null : value;
        optimizeBudget(blockId);
    });

    const cycleInput = blockElement.querySelector('.input-campaign-cycle');
    cycleInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        getBlockById(blockId).campaignCycle = isNaN(value) ? null : value;
        optimizeBudget(blockId);
    });

    // Optional Filters (selects)
    const selectFilters = ['uf', 'regional_boticario', 'praca', 'taxonomia', 'cluster_exibidores', 'exibidores', 'cluster_formato', 'formato', 'periodicidade', 'flight'];
    selectFilters.forEach(filterName => {
        const select = blockElement.querySelector(`.filter-${filterName}`);
        if (select) {
            select.addEventListener('change', (e) => {
                getBlockById(blockId).filters[filterName] = e.target.value;

                // Se mudou a praça, atualizar UF automaticamente (especial)
                if (filterName === 'praca' && e.target.value !== 'Tudo') {
                    const pracaKey = e.target.value.toLowerCase();
                    const correspondingUf = state.pracaToUfMap[pracaKey];

                    if (correspondingUf) {
                        getBlockById(blockId).filters.uf = correspondingUf;
                    }
                }

                // Atualiza filtros disponíveis para os OUTROS campos
                updateAvailableFilters(blockId);

                // Re-optimize with new filters
                optimizeBudget(blockId);
            });
        }
    });

    // Optional Filters (checkboxes) - Digital and Estático
    const digitalCheckbox = blockElement.querySelector('.filter-digital-checkbox');
    if (digitalCheckbox) {
        digitalCheckbox.addEventListener('change', (e) => {
            getBlockById(blockId).filters.digital = e.target.checked;
            optimizeBudget(blockId);
        });
    }

    const estaticoCheckbox = blockElement.querySelector('.filter-estatico-checkbox');
    if (estaticoCheckbox) {
        estaticoCheckbox.addEventListener('change', (e) => {
            getBlockById(blockId).filters.estatico = e.target.checked;
            optimizeBudget(blockId);
        });
    }

    // Botão delete (remove bloco)
    const deleteBtn = blockElement.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', () => removeBlock(blockId));
}

function setupEventListeners() {
    // Reset All
    document.getElementById('btnResetAll').addEventListener('click', resetAll);

    // Export
    document.getElementById('btnExport').addEventListener('click', exportCSV);

    // Config (placeholder)
    // Config (placeholder)
    const btnConfig = document.getElementById('btnConfig');
    if (btnConfig) {
        btnConfig.addEventListener('click', () => {
            alert('Configurações em desenvolvimento');
        });
    }

    // Store to BigQuery
    const btnStore = document.getElementById('btnStore');
    if (btnStore) {
        btnStore.addEventListener('click', storeToBigQuery);
    }

    // Save Plan
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
    const resultsSection = blockElement.querySelector('.budget-results-section');
    const messageDiv = blockElement.querySelector('.block-message');

    // Hide results if no optimization
    if (!block.optimizationResult || block.optimizationResult.status === 'error') {
        // Estado de erro ou inativo
        if (statusBadge) {
            statusBadge.textContent = 'INATIVO';
            statusBadge.classList.add('inactive');
            statusBadge.classList.remove('active');
        }

        if (resultsSection) resultsSection.style.display = 'none';

        if (block.optimizationResult?.message) {
            messageDiv.textContent = block.optimizationResult.message;
            messageDiv.className = 'block-message error';
            messageDiv.style.display = 'block';
        } else {
            messageDiv.style.display = 'none';
        }
        return;
    }

    // Show active state
    if (statusBadge) {
        statusBadge.textContent = 'ATIVO';
        statusBadge.classList.remove('inactive');
        statusBadge.classList.add('active');
    }

    // Show results section
    if (resultsSection) resultsSection.style.display = 'block';

    const result = block.optimizationResult;

    // Update status indicator
    const statusMessageMain = blockElement.querySelector('.status-message-main');
    const statusIndicatorMain = blockElement.querySelector('.status-indicator-main');

    if (statusMessageMain && statusIndicatorMain) {
        statusMessageMain.textContent = result.statusMessage || '--';

        // Apply status classes
        statusIndicatorMain.classList.remove('status-ok', 'status-warning', 'status-info');
        if (result.status === 'sufficient') {
            statusIndicatorMain.classList.add('status-ok');
        } else if (result.status === 'insufficient') {
            statusIndicatorMain.classList.add('status-warning');
        } else if (result.status === 'excessive') {
            statusIndicatorMain.classList.add('status-info');
        }
    }

    // Update metrics
    const facesCount = blockElement.querySelector('.faces-count');
    const idealBudget = blockElement.querySelector('.ideal-budget');
    const allocatedBudget = blockElement.querySelector('.allocated-budget');
    const remainingBudget = blockElement.querySelector('.remaining-budget');

    if (facesCount) facesCount.textContent = result.facesCount || 0;
    if (idealBudget) idealBudget.textContent = formatCurrency(result.idealBudget);
    if (allocatedBudget) allocatedBudget.textContent = formatCurrency(result.allocatedBudget);
    if (remainingBudget) remainingBudget.textContent = formatCurrency(result.remainingBudget);

    // Update priority table
    updatePriorityTable(blockElement, result.recommendedFaces || []);

    // Hide message if success
    messageDiv.style.display = 'none';
}

/**
 * Update priority table with recommended faces
 */
function updatePriorityTable(blockElement, faces) {
    const tbody = blockElement.querySelector('.priority-list-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (faces.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem; opacity: 0.6;">Nenhuma face alocada</td></tr>';
        return;
    }

    // Show top 10 faces
    const displayFaces = faces.slice(0, 10);

    displayFaces.forEach((face) => {
        const row = document.createElement('tr');

        // Apply priority styling (top 3)
        if (face.priority === 1) row.classList.add('priority-gold');
        if (face.priority === 2) row.classList.add('priority-silver');
        if (face.priority === 3) row.classList.add('priority-bronze');

        row.innerHTML = `
            <td><strong>${face.priority}</strong></td>
            <td>${face.praca || '--'}</td>
            <td>${face.uf || '--'}</td>
            <td>${face.exibidores || '--'}</td>
            <td>${face.formato || '--'}</td>
            <td>${face.quantity || 0}</td>
            <td>${formatCurrency(face.unitPrice)}</td>
            <td><strong>${formatCurrency(face.totalCost)}</strong></td>
            <td><span class="roi-badge">${face.roi}</span></td>
        `;
        tbody.appendChild(row);
    });

    // Show total count if more than 10
    if (faces.length > 10) {
        const moreRow = document.createElement('tr');
        moreRow.innerHTML = `<td colspan="9" style="text-align: center; padding: 1rem; background: #f3f4f6; font-style: italic;">+ ${faces.length - 10} faces adicionais...</td>`;
        tbody.appendChild(moreRow);
    }
}

function updateConsolidated() {
    // Atualizar Total Card
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.optimizationResult?.allocatedBudget);
    const totalCard = activeBlocks.reduce((sum, b) => sum + b.optimizationResult.allocatedBudget, 0);

    document.getElementById('totalCard').textContent = formatCurrency(totalCard);


    // ============================================
    // ATUALIZAR INDICADORES (KPIs)
    // ============================================
    const totalExposure = activeBlocks.reduce((sum, b) => sum + (b.optimizationResult.exposicao_estimada || 0), 0);
    // Calc Global Efficiency = Total Impressions / Total Cost (CPMs average out)
    const globalEfficiency = totalCard > 0 ? totalExposure / totalCard : 0;

    // 1. Eficiência Líquida
    // Baseline = 1.0 (Unit Efficiency)
    // Scale: 0.0 to 2.0 (Baseline at 50%)
    const eficienciaValue = document.getElementById('eficienciaValue');
    const eficienciaCursor = document.getElementById('eficienciaCursor');

    if (eficienciaValue) eficienciaValue.textContent = globalEfficiency.toFixed(2);

    if (eficienciaCursor) {
        // Clamp between 0 and 2.0
        const eff = Math.min(Math.max(globalEfficiency, 0), 2.0);
        // Map 0 -> 0%, 1.0 -> 50%, 2.0 -> 100%
        // Percent = (Value / Max) * 100
        const percent = (eff / 2.0) * 100;
        eficienciaCursor.style.left = `${percent}%`;
    }

    // 2. Índice de Exposição
    // Baseline Logic: 
    // Ideally we'd have a specific target. For now, let's assume Baseline = "Total Ideal Budget Potential".
    // Or we use a fixed scale if requested. 
    // Let's use the sum of "Ideal Budgets" of active blocks to estimate "Ideal Exposure".

    const totalIdealBudget = activeBlocks.reduce((sum, b) => sum + (b.optimizationResult.idealBudget || 0), 0);
    // Estimate Ideal Exposure based on current efficiency
    // If allocated budget = X and exposure = Y, then Ideal Exposure ~= Ideal Budget * (Y/X)

    let totalIdealExposure = 0;
    if (totalCard > 0 && totalExposure > 0) {
        const currentRate = totalExposure / totalCard;
        totalIdealExposure = totalIdealBudget * currentRate;
    } else {
        // Fallback if no data: 6M (old max)
        totalIdealExposure = 6000000;
    }

    // Set Scale Max = Ideal * 2 (so Ideal is at 50%)
    const maxExposureScale = totalIdealExposure * 2 || 12000000;

    const exposicaoValue = document.getElementById('exposicaoValue');
    const exposicaoCursor = document.getElementById('exposicaoCursor');

    if (exposicaoValue) {
        const millions = totalExposure / 1000000;
        exposicaoValue.textContent = millions > 0 ? millions.toFixed(1) + 'M' : '0';
    }

    if (exposicaoCursor) {
        // Clamp
        const exp = Math.min(Math.max(totalExposure, 0), maxExposureScale);
        const percent = (exp / maxExposureScale) * 100;
        exposicaoCursor.style.left = `${percent}%`;

        // Also update baseline tooltip if possible or log it
        // document.querySelector('.chart-cursor.baseline').title = `Baseline: ${(totalIdealExposure/1000000).toFixed(1)}M`;
    }

    // Atualizar tabela consolidada
    const tbody = document.getElementById('consolidatedTableBody');
    tbody.innerHTML = '';

    if (activeBlocks.length === 0) {
        tbody.innerHTML = '<tr class="empty-state"><td colspan="12">Nenhuma mídia configurada ainda</td></tr>';
    } else {
        activeBlocks.forEach(block => {
            const result = block.optimizationResult;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Mídia ${block.id}</td>
                <td>${block.filters.uf}</td>
                <td>${block.filters.praca}</td>
                <td>${block.filters.taxonomia}</td>
                <td>${block.filters.exibidores}</td>
                <td>${block.filters.formato}</td>
                <td>${result.facesCount || 0}</td>
                <td>${formatCurrency(block.budget)}</td>
                <td>${formatCurrency(result.allocatedBudget)}</td>
                <td>${formatCurrency(result.idealBudget)}</td>
                <td>${formatCurrency(result.remainingBudget)}</td>
                <td><span class="status-badge">${result.status === 'sufficient' ? '✅' : result.status === 'insufficient' ? '⚠️' : '💡'}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
}

// Removed old indicator functions - no longer needed with budget-first approach

// ============================================
// ACTIONS
// ============================================
function resetBlock(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);

    // Reset state
    block.budget = null;
    block.campaignCycle = null;
    block.filters = {
        uf: 'Tudo',
        praca: 'Tudo',
        taxonomia: 'Tudo',
        exibidores: 'Tudo',
        formato: 'Tudo',
        regional_boticario: 'Tudo',
        cluster_exibidores: 'Tudo',
        cluster_formato: 'Tudo',
        periodicidade: 'Tudo',
        flight: 'Tudo',
        digital: false,
        estatico: false
    };
    block.optimizationResult = null;
    block.active = false;

    // Reset UI
    blockElement.querySelectorAll('select').forEach(select => select.value = 'Tudo');
    blockElement.querySelectorAll('input').forEach(input => {
        input.value = '';
    });

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

async function storeToBigQuery() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.optimizationResult?.allocatedBudget > 0);

    if (activeBlocks.length === 0) {
        alert('❌ Nenhuma mídia configurada para armazenar');
        return;
    }

    const totalBudget = activeBlocks.reduce((sum, b) => sum + b.optimizationResult.allocatedBudget, 0);

    // Confirm with user
    const message = `Deseja armazenar ${activeBlocks.length} blocos de mídia no BigQuery?\n\nTotal Budget: ${formatCurrency(totalBudget)}`;
    if (!confirm(message)) return;

    // Prompt for Plan Name
    const planName = prompt("Digite um nome para este plano (Ex: Campanha Verão 2026):", "Novo Plano");
    if (!planName) return; // User cancelled

    // Show loading state
    const btnStore = document.getElementById('btnStore');
    const originalText = btnStore.innerHTML;
    btnStore.innerHTML = '⏳ ARMAZENANDO...';
    btnStore.disabled = true;

    try {
        // Map blocks to expected schema
        // We need to map optimizationResult to the structure expected by the backend
        const mappedBlocks = activeBlocks.map(b => {
            const res = b.optimizationResult;
            return {
                id: b.id,
                filters: b.filters,
                seletor_qtd: res.facesCount, // Map faces count to quantity
                seletor_desc: 0, // No discount selector in new UI
                result: {
                    total_liquido: res.allocatedBudget,
                    total_bruto: res.allocatedBudget, // Assuming gross = net for now
                    preco_unit: res.facesCount > 0 ? res.allocatedBudget / res.facesCount : 0,
                    minimo: 0,
                    maximo: 0,
                    warning: res.statusMessage,
                    exposicao_estimada: res.exposicao_estimada,
                    eficiencia: res.eficiencia,
                    records_found: res.totalInventorySize
                }
            };
        });

        const response = await fetch(`${API_BASE}/bigquery/store`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                activeBlocks: mappedBlocks,
                totalBudget,
                planName
            })
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Dados armazenados com sucesso no BigQuery!\n\nPlano: ${result.planName} (v${result.version})\nSession ID: ${result.sessionId}\nBlocos: ${result.rowsInserted}`);
        } else {
            throw new Error(result.error || 'Erro desconhecido');
        }

    } catch (error) {
        console.error('Erro ao armazenar no BigQuery:', error);

        let errorMessage = '❌ Erro ao armazenar dados no BigQuery\n\n';

        if (error.message.includes('key file not found')) {
            errorMessage += 'Arquivo de credenciais não encontrado.\nVerifique se o arquivo bigquery-key.json está na pasta config/';
        } else if (error.message.includes('Permission denied')) {
            errorMessage += 'Permissão negada.\nVerifique as permissões da Service Account.';
        } else if (error.message.includes('not found')) {
            errorMessage += 'Dataset ou tabela não encontrada.\nVerifique a configuração do BigQuery.';
        } else {
            errorMessage += error.message;
        }

        alert(errorMessage);
        // Restore button state
        btnStore.innerHTML = originalText;
        btnStore.disabled = false;
    }
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
                data: state.mediaBlocks // Save entire state, including inactive blocks if desired, or just active
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

function showError(message) {
    alert(message);
}

function exportCSV() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.optimizationResult);

    if (activeBlocks.length === 0) {
        alert('Nenhuma mídia configurada para exportar');
        return;
    }

    // ===== PARTE 1: RESUMO DOS BLOCOS =====
    const summaryHeaders = ['Mídia', 'Budget Input', 'Ciclo (semanas)', 'UF', 'Praça', 'Taxonomia', 'Exibidores', 'Formato', 'Região', 'Cluster Exibidores', 'Cluster Formato', 'Periodicidade', 'Flight', 'Digital', 'Estático', 'Faces Alocadas', 'Budget Utilizado', 'Budget Ideal', 'Sobrando', 'Status'];
    const summaryRows = activeBlocks.map(block => [
        `Mídia ${block.id}`,
        formatCurrency(block.budget),
        block.campaignCycle,
        block.filters.uf || 'Tudo',
        block.filters.praca || 'Tudo',
        block.filters.taxonomia || 'Tudo',
        block.filters.exibidores || 'Tudo',
        block.filters.formato || 'Tudo',
        block.filters.regional_boticario || 'Tudo',
        block.filters.cluster_exibidores || 'Tudo',
        block.filters.cluster_formato || 'Tudo',
        block.filters.periodicidade || 'Tudo',
        block.filters.flight || 'Tudo',
        block.filters.digital ? 'Sim' : 'Não',
        block.filters.estatico ? 'Sim' : 'Não',
        block.optimizationResult.facesCount || 0,
        formatCurrency(block.optimizationResult.allocatedBudget || 0),
        formatCurrency(block.optimizationResult.idealBudget || 0),
        formatCurrency(block.optimizationResult.remainingBudget || 0),
        block.optimizationResult.budgetStatus || block.optimizationResult.status || '-'
    ]);

    // ===== PARTE 2: DETALHES DAS FACES RECOMENDADAS =====
    const detailsHeaders = ['Mídia', 'Prioridade', 'Praça', 'UF', 'Exibidores', 'Taxonomia', 'Formato', 'Qtd Disponível', 'Preço Unitário', 'ROI', 'Alocado'];
    const detailsRows = [];

    activeBlocks.forEach(block => {
        const recommendedFaces = block.optimizationResult.recommendedFaces || [];
        recommendedFaces.forEach((face, index) => {
            detailsRows.push([
                `Mídia ${block.id}`,
                face.priority || (index + 1),
                face.praca || '-',
                face.uf || '-',
                face.exibidores || '-',
                face.taxonomia || '-',
                face.formato || '-',
                face.quantity || 0,
                formatCurrency(face.unitPrice || 0),
                (parseFloat(face.roi) || 0).toFixed(4),
                face.allocated || 0
            ]);
        });
    });

    // ===== GERAR CSV COMPLETO =====
    let csv = '';

    // Seção 1: Resumo
    csv += '=== RESUMO DOS BLOCOS DE MÍDIA ===\n';
    csv += [summaryHeaders, ...summaryRows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    csv += '\n\n';

    // Seção 2: Detalhes das Faces
    if (detailsRows.length > 0) {
        csv += '=== FACES RECOMENDADAS (DETALHADO) ===\n';
        csv += [detailsHeaders, ...detailsRows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');
    }

    // Download Strategy
    // Removed trailing semicolon which confuses some browsers
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `plano_ooh_${timestamp}.csv`;

    // Explicitly set download property and href
    link.href = url;
    link.download = filename;
    link.style.display = 'none';

    document.body.appendChild(link);

    // Small delay to ensure DOM is ready
    setTimeout(() => {
        link.click();

        // Cleanup after download trigger (increased delay for safety)
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 500);
    }, 50);

    console.log(`✅ CSV exportado: ${activeBlocks.length} blocos, ${detailsRows.length} faces detalhadas`);
}

/**
 * Load plan from server
 */
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

            // Restore state
            state.mediaBlocks = data.plan.data;

            // Generate IDs for blocks if missing (legacy support)
            state.mediaBlocks.forEach((block, index) => {
                if (!block.id) block.id = index + 1;
            });

            // Update nextBlockId
            const maxId = Math.max(...state.mediaBlocks.map(b => b.id), 0);
            state.nextBlockId = maxId + 1;

            renderMediaBlocks();
            updateConsolidated();

            // Clear URL param without reload
            window.history.replaceState({}, document.title, "/");

            console.log('✅ Plan loaded successfully');
        }
    } catch (err) {
        console.error('Error loading plan:', err);
        showError('Erro ao carregar o plano. Ele pode ter sido excluído.');
        renderMediaBlocks(); // Fallback to default
    }
}
