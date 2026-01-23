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
        filters: {
            uf: 'Tudo',
            praca: 'Tudo',
            taxonomia: 'Tudo',
            exibidores: 'Tudo',
            formato: 'Tudo',
            digital: 'Tudo',
            estatico: 'Tudo'
        },
        seletor_qtd: null,
        seletor_desc: 0,
        result: null
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
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando OOH Planner...');

    try {
        // Setup event listeners
        setupEventListeners();

        // Carregar filtros disponíveis
        await loadFilters();

        // Renderizar blocos iniciais
        renderMediaBlocks();

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

async function calculateBlock(blockId) {
    const block = getBlockById(blockId);

    try {
        const response = await fetch(`${API_BASE}/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filters: block.filters,
                seletor_qtd: block.seletor_qtd,
                seletor_desc: block.seletor_desc
            })
        });

        if (!response.ok) throw new Error('Erro ao calcular');

        const result = await response.json();
        block.result = result;
        block.active = result.status === 'success';

        updateBlockUI(blockId);
        updateConsolidated();

    } catch (err) {
        console.error(`Erro ao calcular bloco ${blockId}:`, err);
        block.result = { status: 'error', message: 'Erro de conexão' };
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

        // Restore static filters (Digital/Estatico)
        const digitalSelect = block.querySelector('.filter-digital');
        if (digitalSelect && blockState.filters.digital) {
            digitalSelect.value = blockState.filters.digital;
        }

        const estaticoSelect = block.querySelector('.filter-estatico');
        if (estaticoSelect && blockState.filters.estatico) {
            estaticoSelect.value = blockState.filters.estatico;
        }

        // Preencher valores se existirem
        if (blockState.seletor_qtd) block.querySelector('.input-qtd').value = blockState.seletor_qtd;
        if (blockState.seletor_desc !== null) block.querySelector('.input-desc').value = blockState.seletor_desc;

        // Event listeners
        setupBlockListeners(block, blockState.id);

        // Se já tiver resultado, atualizar UI
        if (blockState.result) updateBlockUI(blockState.id);

        container.appendChild(clone);
    });
}

function populateFilters(blockElement, blockId, availableFilters = null) {
    const filtersToPopulate = ['uf', 'praca', 'taxonomia', 'exibidores', 'formato'];
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
    // Filtros
    const filters = ['uf', 'praca', 'taxonomia', 'exibidores', 'formato', 'digital', 'estatico'];
    filters.forEach(filterName => {
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

                // Calcula o bloco
                calculateBlock(blockId);
            });
        }
    });

    // Quantidade
    const qtdInput = blockElement.querySelector('.input-qtd');
    qtdInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        getBlockById(blockId).seletor_qtd = isNaN(value) ? null : value;
        calculateBlock(blockId);
    });

    // Desconto
    const descInput = blockElement.querySelector('.input-desc');
    descInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        getBlockById(blockId).seletor_desc = isNaN(value) ? null : value;
        calculateBlock(blockId);
    });

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
    document.getElementById('btnConfig').addEventListener('click', () => {
        alert('Configurações em desenvolvimento');
    });

    // Store to BigQuery
    document.getElementById('btnStore').addEventListener('click', storeToBigQuery);
}

// ============================================
// UI UPDATES
// ============================================
function updateBlockUI(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement) return;

    const resultValue = blockElement.querySelector('.result-value');
    const statusBadge = blockElement.querySelector('.status-badge');
    const messageDiv = blockElement.querySelector('.block-message');
    const minimoValue = blockElement.querySelector('.min-value');
    const maximoValue = blockElement.querySelector('.max-value');

    if (!block.result || block.result.status === 'error') {
        // Estado de erro
        resultValue.textContent = '--';
        if (statusBadge) {
            statusBadge.textContent = 'INATIVO';
            statusBadge.classList.add('inactive');
        }

        if (minimoValue) minimoValue.textContent = '--';
        if (maximoValue) maximoValue.textContent = '--';

        if (block.result?.message) {
            messageDiv.textContent = block.result.message;
            messageDiv.className = 'block-message error';
            messageDiv.style.display = 'block';
        } else {
            messageDiv.style.display = 'none';
        }
    } else {
        // Estado de sucesso
        resultValue.textContent = formatCurrency(block.result.total_liquido);
        if (statusBadge) {
            statusBadge.textContent = '+ CÁLCULO ATIVO';
            statusBadge.classList.remove('inactive');
        }

        if (minimoValue) minimoValue.textContent = block.result.minimo || '--';
        if (maximoValue) maximoValue.textContent = block.result.maximo || '--';

        // Atualizar indicadores do bloco
        updateBlockIndicators(blockElement, block.result);

        // Avisos de guardrail
        if (block.result.warning) {
            messageDiv.textContent = block.result.warning;
            messageDiv.className = 'block-message warning';
            messageDiv.style.display = 'block';
        } else {
            messageDiv.style.display = 'none';
        }
    }
}

function updateConsolidated() {
    // Atualizar Total Card
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.result?.total_liquido);
    const totalCard = activeBlocks.reduce((sum, b) => sum + b.result.total_liquido, 0);

    document.getElementById('totalCard').textContent = formatCurrency(totalCard);

    // Atualizar tabela consolidada
    const tbody = document.getElementById('consolidatedTableBody');
    tbody.innerHTML = '';

    if (activeBlocks.length === 0) {
        tbody.innerHTML = '<tr class="empty-state"><td colspan="12">Nenhuma mídia configurada ainda</td></tr>';
    } else {
        activeBlocks.forEach(block => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Mídia ${block.id}</td>
                <td>${block.filters.uf}</td>
                <td>${block.filters.praca}</td>
                <td>${block.filters.taxonomia}</td>
                <td>${block.filters.exibidores}</td>
                <td>${block.filters.formato}</td>
                <td>${block.seletor_qtd || '--'}</td>
                <td>${block.seletor_desc ? (block.seletor_desc * 100).toFixed(0) + '%' : '--'}</td>
                <td>${formatCurrency(block.result.total_liquido)}</td>
                <td>${block.result.minimo || '--'}</td>
                <td>${block.result.maximo || '--'}</td>
                <td><span class="status-badge">${block.result.warning ? '⚠️' : '✅'}</span></td>
            `;
            tbody.appendChild(row);
        });
    }

    // Atualizar indicadores (placeholder - sem dados de exposição ainda)
    updateIndicators();
}

/**
 * Atualiza os indicadores de um bloco individual
 */
function updateBlockIndicators(blockElement, result) {
    const eficienciaFill = blockElement.querySelector('.eficiencia-fill');
    const exposicaoFill = blockElement.querySelector('.exposicao-fill');

    if (result.eficiencia !== null && result.eficiencia !== undefined) {
        // Eficiência: normalizar para escala 0-1.0 (ajustado para o inventário atual)
        // Valores típicos neste dataset são baixos (< 1) devido ao alto valor unitário
        const maxScale = 1.0;
        const eficienciaPercent = Math.min((result.eficiencia / maxScale) * 100, 100);
        if (eficienciaFill) eficienciaFill.style.width = `${eficienciaPercent}%`;
    } else {
        if (eficienciaFill) eficienciaFill.style.width = '0%';
    }

    if (result.exposicao_estimada !== null && result.exposicao_estimada !== undefined) {
        // Exposição: normalizar para escala 0-8 milhões (valores típicos)
        // Consideramos 4M+ como excelente (50%+)
        const exposicaoPercent = Math.min((result.exposicao_estimada / 8000000) * 100, 100);
        if (exposicaoFill) exposicaoFill.style.width = `${exposicaoPercent}%`;
    } else {
        if (exposicaoFill) exposicaoFill.style.width = '0%';
    }
}

/**
 * Atualiza os indicadores globais (header)
 */
function updateIndicators() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.result?.total_liquido);
    const eficienciaBar = document.getElementById('eficienciaBar');
    const exposicaoBar = document.getElementById('exposicaoBar');
    const eficienciaValue = document.getElementById('eficienciaValue');
    const exposicaoValue = document.getElementById('exposicaoValue');

    if (activeBlocks.length === 0) {
        if (eficienciaBar) eficienciaBar.style.width = '0%';
        if (exposicaoBar) exposicaoBar.style.width = '0%';
        if (eficienciaValue) eficienciaValue.textContent = '0';
        if (exposicaoValue) exposicaoValue.textContent = '0';
        return;
    }

    // Calcular totais
    const totalExposicao = activeBlocks.reduce((sum, b) => {
        return sum + (b.result.exposicao_estimada || 0);
    }, 0);

    const totalBudget = activeBlocks.reduce((sum, b) => sum + b.result.total_liquido, 0);
    const eficienciaMedia = totalBudget > 0 ? totalExposicao / totalBudget : 0;

    // Atualizar barras
    // Eficiência: normalizar para 0-1.0
    const maxScale = 1.0;
    const eficienciaPercent = Math.min((eficienciaMedia / maxScale) * 100, 100);
    if (eficienciaBar) eficienciaBar.style.width = `${eficienciaPercent}%`;
    if (eficienciaValue) eficienciaValue.textContent = eficienciaMedia.toFixed(2); // 2 casas decimais

    // Exposição: normalizar para escala 0-8M
    const exposicaoPercent = Math.min((totalExposicao / 8000000) * 100, 100);
    if (exposicaoBar) exposicaoBar.style.width = `${exposicaoPercent}%`;

    // Mostrar em milhões
    const exposicaoMilhoes = (totalExposicao / 1000000).toFixed(1);
    if (exposicaoValue) exposicaoValue.textContent = `${exposicaoMilhoes}M`;
}

// ============================================
// ACTIONS
// ============================================
function resetBlock(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);

    // Reset state
    block.filters = {
        uf: 'Tudo',
        praca: 'Tudo',
        taxonomia: 'Tudo',
        exibidores: 'Tudo',
        formato: 'Tudo',
        digital: 'Tudo',
        estatico: 'Tudo'
    };
    block.seletor_qtd = null;
    block.seletor_desc = 0;
    block.result = null;
    block.active = false;

    // Reset UI
    blockElement.querySelectorAll('select').forEach(select => select.value = 'Tudo');
    blockElement.querySelectorAll('input').forEach(input => {
        if (input.classList.contains('input-desc')) {
            input.value = '0';
        } else {
            input.value = '';
        }
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
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.result?.total_liquido);

    if (activeBlocks.length === 0) {
        alert('❌ Nenhuma mídia configurada para armazenar');
        return;
    }

    const totalBudget = activeBlocks.reduce((sum, b) => sum + b.result.total_liquido, 0);

    // Confirm with user
    const message = `Deseja armazenar ${activeBlocks.length} blocos de mídia no BigQuery?\n\nTotal Budget: ${formatCurrency(totalBudget)}`;
    if (!confirm(message)) return;

    // Show loading state
    const btnStore = document.getElementById('btnStore');
    const originalText = btnStore.innerHTML;
    btnStore.innerHTML = '⏳ ARMAZENANDO...';
    btnStore.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/bigquery/store`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                activeBlocks,
                totalBudget
            })
        });

        const result = await response.json();

        if (result.success) {
            alert(`✅ Dados armazenados com sucesso no BigQuery!\n\nSession ID: ${result.sessionId}\nBlocos: ${result.rowsInserted}\nTimestamp: ${new Date(result.timestamp).toLocaleString('pt-BR')}`);
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
    } finally {
        // Restore button state
        btnStore.innerHTML = originalText;
        btnStore.disabled = false;
    }
}

function exportCSV() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.result?.total_liquido);

    if (activeBlocks.length === 0) {
        alert('Nenhuma mídia configurada para exportar');
        return;
    }

    // Criar CSV
    const headers = ['Mídia', 'UF', 'Praça', 'Taxonomia', 'Exibidores', 'Formato', 'Digital', 'Estático', 'Quantidade', 'Desconto', 'Total Líquido', 'Mínimo', 'Máximo'];
    const rows = activeBlocks.map(block => [
        `Mídia ${block.id}`,
        block.filters.uf,
        block.filters.praca,
        block.filters.taxonomia,
        block.filters.exibidores,
        block.filters.formato,
        block.filters.digital,
        block.filters.estatico,
        block.seletor_qtd,
        block.seletor_desc,
        block.result.total_liquido,
        block.result.minimo || '',
        block.result.maximo || ''
    ]);

    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `ooh_planner_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
