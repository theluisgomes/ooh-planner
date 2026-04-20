// ============================================
// GLOBAL STATE
// ============================================
const API_BASE = '/api';

// ============================================
// HELPERS
// ============================================
function createBlockState(id) {
    return {
        id: id,
        active: false,
        budget: null,
        campaignCycle: 4,
        taxonomia: null,
        praca: null,
        planningData: null,
        planningRows: null,
        budgetAllocation: null
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
    if (state.mediaBlocks.length <= 1) {
        resetBlock(blockId);
        return;
    }
    if (!confirm('Tem certeza que deseja remover este plano de mídia?')) return;
    state.mediaBlocks = state.mediaBlocks.filter(b => b.id !== Number(blockId));
    renderMediaBlocks();
    updateConsolidated();
}

// Fix #8: Title case helper for praça dropdown labels
function toTitleCase(str) {
    if (!str) return str;
    return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function normalizeTotalFaces(row) {
    const min = Number.isFinite(Number(row.range_minimo)) ? Number(row.range_minimo) : 0;
    const current = Number.isFinite(Number(row.totalFaces)) ? Number(row.totalFaces) : 0;
    const rawMax = Number(row.range_maximo);
    // When range_maximo is 0/null, fall back to raw quantity so rows are not zeroed out
    let max = (Number.isFinite(rawMax) && rawMax > 0) ? rawMax : Math.max(current, min);
    if (max < min) max = min;
    return Math.min(Math.max(current, min), max);
}

function distributeFacesAcrossWeeks(row, facesTotal) {
    const totalWeight = (row.s1 || 0) + (row.s2 || 0) + (row.s3 || 0) + (row.s4 || 0);

    if (totalWeight <= 0) {
        // No base week profile: deterministic even split with remainder in S4.
        const perWeek = Math.floor(facesTotal / 4);
        row.s1_edit = perWeek;
        row.s2_edit = perWeek;
        row.s3_edit = perWeek;
        row.s4_edit = facesTotal - (perWeek * 3);
        return;
    }

    // Deterministic split following base week proportions (S1-S4).
    row.s1_edit = Math.round(facesTotal * ((row.s1 || 0) / totalWeight));
    row.s2_edit = Math.round(facesTotal * ((row.s2 || 0) / totalWeight));
    row.s3_edit = Math.round(facesTotal * ((row.s3 || 0) / totalWeight));
    row.s4_edit = Math.round(facesTotal * ((row.s4 || 0) / totalWeight));

    // Round-fix to keep exact total.
    const currentSum = row.s1_edit + row.s2_edit + row.s3_edit + row.s4_edit;
    if (currentSum !== facesTotal) {
        const diff = facesTotal - currentSum;
        if (row.s1_edit > 0) row.s1_edit += diff;
        else if (row.s2_edit > 0) row.s2_edit += diff;
        else if (row.s3_edit > 0) row.s3_edit += diff;
        else if (row.s4_edit > 0) row.s4_edit += diff;
        else row.s1_edit += diff;
    }
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

/**
 * Cross-filter: update taxonomia options based on selected praça
 */
async function updateTaxonomiaOptions(blockElement, praca) {
    const taxonomiaSelect = blockElement.querySelector('.input-taxonomia');
    if (!taxonomiaSelect) return;

    const currentValue = taxonomiaSelect.value;

    // Clear existing options (keep the default empty option)
    taxonomiaSelect.innerHTML = '<option value="">Selecione...</option>';

    if (!praca) {
        // No praça selected — show all ciclos
        (state.filters.taxonomia || []).forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            taxonomiaSelect.appendChild(option);
        });
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/filters/available`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters: { praca } })
        });

        if (!response.ok) throw new Error('Erro ao buscar filtros disponíveis');

        const available = await response.json();
        const taxonomias = available.taxonomia || [];

        taxonomias.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            taxonomiaSelect.appendChild(option);
        });

        // Preserve previous selection if still valid
        if (currentValue && taxonomias.includes(currentValue)) {
            taxonomiaSelect.value = currentValue;
        } else {
            taxonomiaSelect.value = '';
        }

        console.log(`🔗 Cross-filter: praça "${praca}" → ${taxonomias.length} ciclos disponíveis`);
    } catch (err) {
        console.error('Erro ao atualizar ciclos:', err);
        // Fallback: show all ciclos
        (state.filters.taxonomia || []).forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            taxonomiaSelect.appendChild(option);
        });
    }
}

async function fetchPlanningData(blockId) {
    const block = getBlockById(blockId);

    if (!block.taxonomia || !block.praca) {
        block.planningData = null;
        block.planningRows = null;
        block.active = false;
        updateBlockUI(blockId);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/get-planning-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                taxonomia: block.taxonomia,
                praca: block.praca,
                formato: block.formato,
                exibidores: block.exibidores
            })
        });

        if (!response.ok) throw new Error('Erro ao buscar dados de planejamento');

        const result = await response.json();

        if (result.status === 'error') {
            block.planningData = null;
            block.active = false;
            showBlockMessage(blockId, result.message, 'error');
        } else if (!result.rows || result.rows.length === 0) {
            block.planningData = null;
            block.active = false;
            showBlockMessage(blockId, 'Nenhum inventário disponível para esta praça/taxonomia', 'warning');
        } else {
            block.planningData = result.rows;
            block.active = true;

            // Initialize planningRows with editable fields
            block.planningRows = result.rows.map(row => {
                const rawMax = Number(row.range_maximo);
                const rawQty = Number(row.totalFaces) || 0;
                // maxFaces = stable capacity reference, never overwritten by recalculation
                const maxFaces = (Number.isFinite(rawMax) && rawMax > 0) ? rawMax : rawQty;
                return {
                    ...row,
                    totalFaces: normalizeTotalFaces(row),
                    maxFaces,
                    negociacao_edit: row.desconto || 0,
                    obs: '',
                    s1_edit: 0,
                    s2_edit: 0,
                    s3_edit: 0,
                    s4_edit: 0,
                    facesUsadas: 0,
                    budgetIdeal: 0,
                    custoFace: 0,
                    ttNeg: 0,
                    totalLinha: 0
                };
            });

            // Auto-optimize face allocation based on budget
            autoAllocateFaces(block);
        }

        updateBlockUI(blockId);
        updateConsolidated();

    } catch (err) {
        console.error(`Erro ao buscar planning data do bloco ${blockId}:`, err);
        block.planningData = null;
        block.active = false;
        showBlockMessage(blockId, 'Erro de conexão ao buscar dados', 'error');
        updateBlockUI(blockId);
    }
}

// ============================================
// AUTO-ALLOCATION: distributes faces to fit budget
// ============================================
// Pricing rules:
// - CIRCUITO rows are all-or-nothing: buying means paying the whole package
//   (unitario_bruto_tabela × range_maximo) and activating every face in the
//   circuit. The allocator either activates the full circuit or skips it.
// - UNITÁRIO rows are per-face: each additional face costs unitario_bruto_tabela.
// ============================================
function autoAllocateFaces(block) {
    if (!block.planningRows) return;
    const budget = block.budget || 0;
    const rows = block.planningRows;

    // Stable capacity = range_maximo when available, otherwise maxFaces (set at init and never overwritten)
    const getCapacity = (row) => {
        const rMax = Number(row.range_maximo);
        return (Number.isFinite(rMax) && rMax > 0) ? rMax : (row.maxFaces || 0);
    };

    const getFacesCount = (row) =>
        (row.s1_edit || 0) + (row.s2_edit || 0) + (row.s3_edit || 0) + (row.s4_edit || 0);

    const isCircuito = (row) => !!row.circuito;

    // Reset all allocations before recomputing
    rows.forEach(row => {
        row.s1_edit = 0; row.s2_edit = 0; row.s3_edit = 0; row.s4_edit = 0;
    });

    // Total cost at MAX capacity (all rows fully allocated)
    const totalMaxCost = rows.reduce((sum, r) => sum + r.unitario_bruto_tabela * getCapacity(r), 0);

    if (totalMaxCost <= 0) {
        recalculatePlanningRows(block);
        return;
    }

    // No budget constraint or budget covers full MAX: allocate everything
    if (!budget || budget <= 0 || budget >= totalMaxCost) {
        rows.forEach(row => {
            distributeFacesAcrossWeeks(row, getCapacity(row));
        });
        recalculatePlanningRows(block);
        return;
    }

    // Budget-limited allocation — sort by priority descending (peso)
    const indexed = rows.map((r, i) => ({ row: r, idx: i }))
                       .sort((a, b) => (b.row.pesos || 0) - (a.row.pesos || 0));

    let remainingBudget = budget;

    // Pass 0: CIRCUITOS (all-or-nothing) in priority order
    // Each circuit is bought fully at unitario_bruto_tabela × capacity, or skipped.
    for (const { row } of indexed) {
        if (remainingBudget <= 0) break;
        if (!isCircuito(row)) continue;
        const capacity = getCapacity(row);
        const packageCost = row.unitario_bruto_tabela * capacity;
        if (packageCost > 0 && packageCost <= remainingBudget && capacity > 0) {
            distributeFacesAcrossWeeks(row, capacity);
            remainingBudget -= packageCost;
        }
    }

    // Pass 1: guarantee range_minimo for each UNITÁRIO row (highest priority first)
    for (const { row } of indexed) {
        if (remainingBudget <= 0) break;
        if (isCircuito(row)) continue;
        if (getFacesCount(row) > 0) continue;
        const minFaces = row.range_minimo || 0;
        if (minFaces > 0 && row.unitario_bruto_tabela > 0) {
            const canAfford = Math.floor(remainingBudget / row.unitario_bruto_tabela);
            const allocMin = Math.min(canAfford, minFaces);
            if (allocMin > 0) {
                distributeFacesAcrossWeeks(row, allocMin);
                remainingBudget -= row.unitario_bruto_tabela * allocMin;
            }
        }
    }

    // Pass 1.5: guarantee at least 1 face for every zeroed UNITÁRIO that still fits
    // Prevents expensive rows (e.g. empenas) from staying zeroed when budget allows.
    for (const { row } of indexed) {
        if (remainingBudget <= 0) break;
        if (isCircuito(row)) continue;
        if (getFacesCount(row) > 0) continue;
        if (row.unitario_bruto_tabela <= 0) continue;
        const capacity = getCapacity(row);
        if (capacity <= 0) continue;
        if (row.unitario_bruto_tabela <= remainingBudget) {
            distributeFacesAcrossWeeks(row, 1);
            remainingBudget -= row.unitario_bruto_tabela;
        }
    }

    // Pass 2: distribute remaining budget proportionally (by pesos) to UNITÁRIOS up to MAX
    if (remainingBudget > 0) {
        const unitarios = indexed.filter(({ row }) => !isCircuito(row));
        const totalWeight = unitarios.reduce((sum, { row }) => sum + (row.pesos || 0.5), 0);
        if (totalWeight > 0) {
            unitarios.forEach(({ row }) => {
                if (remainingBudget <= 0 || row.unitario_bruto_tabela <= 0) return;
                const capacity = getCapacity(row);
                const currentFaces = getFacesCount(row);
                const canAdd = capacity - currentFaces;
                if (canAdd <= 0) return;
                const weightShare = (row.pesos || 0.5) / totalWeight;
                const extra = Math.min(
                    Math.floor(remainingBudget * weightShare / row.unitario_bruto_tabela),
                    canAdd
                );
                if (extra > 0) {
                    distributeFacesAcrossWeeks(row, currentFaces + extra);
                    remainingBudget -= row.unitario_bruto_tabela * extra;
                }
            });
        }
    }

    // Pass 3: fill highest-priority UNITÁRIOS up to MAX with any leftover budget
    if (remainingBudget > 0) {
        for (const { row } of indexed) {
            if (remainingBudget <= 0) break;
            if (isCircuito(row)) continue;
            if (row.unitario_bruto_tabela <= 0) continue;
            const capacity = getCapacity(row);
            const currentFaces = getFacesCount(row);
            const canAdd = capacity - currentFaces;
            if (canAdd <= 0) continue;
            const extra = Math.min(
                Math.floor(remainingBudget / row.unitario_bruto_tabela),
                canAdd
            );
            if (extra > 0) {
                distributeFacesAcrossWeeks(row, currentFaces + extra);
                remainingBudget -= row.unitario_bruto_tabela * extra;
            }
        }
    }

    recalculatePlanningRows(block);
}

// ============================================
// DERIVED CALCULATIONS
// ============================================
function recalculatePlanningRows(block) {
    if (!block.planningRows) return;

    block.planningRows.forEach(row => {
        // Faces being used = sum of S1-S4 (total units across the period)
        // Base distributes 'quantidade' into s1/s2/s3/s4, so the sum is the total count.
        row.facesUsadas = (row.s1_edit || 0) + (row.s2_edit || 0) + (row.s3_edit || 0) + (row.s4_edit || 0);
        // Keep TT Faces aligned with weekly distribution to avoid inconsistencies in the table.
        row.totalFaces = row.facesUsadas;

        // Total Linha = tabela unit. × faces being used
        row.totalLinha = row.unitario_bruto_tabela * row.facesUsadas;

        // Custo/Face = negotiated price per single face
        const disc = row.negociacao_edit || 0;
        row.custoFace = Math.round(row.unitario_bruto_tabela * (1 - disc) * 100) / 100;

        // TT Neg. = total negotiated cost for this row = custoFace × faces
        row.ttNeg = Math.round(row.custoFace * row.facesUsadas * 100) / 100;

        // Recalc index based on faces being used
        row.index = Math.round(row.facesUsadas * (row.pesos || 0.5) * 100) / 100;

        // Fix #3: RECOMENDADO = total_bruto_negociado da base (valor fixo da base)
        row.budgetIdeal = row.total_bruto_negociado || 0;
    });
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

        clone.querySelector('.number-badge').textContent = index + 1;
        clone.querySelector('.config-label').textContent = `PLANO DE MÍDIA #${String(index + 1).padStart(2, '0')}`;

        populateCoreSelects(block);

        // Restore values
        if (blockState.budget) block.querySelector('.input-budget').value = blockState.budget;
        if (blockState.taxonomia) block.querySelector('.input-taxonomia').value = blockState.taxonomia;
        if (blockState.praca) block.querySelector('.input-praca').value = blockState.praca;

        setupBlockListeners(block, blockState.id);

        container.appendChild(clone);

        // After appending, update UI if block has data
        if (blockState.planningData) {
            setTimeout(() => updateBlockUI(blockState.id), 0);
        }
    });
}

function populateCoreSelects(blockElement) {
    const fillSelect = (selector, data, applyTitleCase = false) => {
        const sel = blockElement.querySelector(selector);
        if (!sel || !data) return;
        data.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            // Fix #8: apply title case to display label for praças
            option.textContent = applyTitleCase ? toTitleCase(val) : val;
            sel.appendChild(option);
        });
    };

    fillSelect('.input-praca', state.filters.praca, true); // Fix #8: title case
    fillSelect('.input-taxonomia', state.filters.taxonomia);
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupBlockListeners(blockElement, blockId) {
    const budgetInput = blockElement.querySelector('.input-budget');
    let budgetDebounce;
    budgetInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        getBlockById(blockId).budget = isNaN(value) ? null : value;
        clearTimeout(budgetDebounce);
        budgetDebounce = setTimeout(() => {
            const blk = getBlockById(blockId);
            if (blk.planningRows) {
                autoAllocateFaces(blk);
                renderPlanningTableBody(blockId);
                updateGauges(blockId);
                updateConsolidated();
            } else {
                fetchPlanningData(blockId);
            }
        }, 400);
    });

    const taxonomiaSelect = blockElement.querySelector('.input-taxonomia');
    taxonomiaSelect.addEventListener('change', (e) => {
        getBlockById(blockId).taxonomia = e.target.value || null;
        fetchPlanningData(blockId);
    });

    const pracaSelect = blockElement.querySelector('.input-praca');
    pracaSelect.addEventListener('change', async (e) => {
        const block = getBlockById(blockId);
        block.praca = e.target.value || null;

        // Cross-filter: update taxonomia options based on selected praça
        await updateTaxonomiaOptions(blockElement, block.praca);

        // If taxonomia was reset (no longer valid for new praça), update block state
        const taxonomiaSelect = blockElement.querySelector('.input-taxonomia');
        block.taxonomia = taxonomiaSelect.value || null;

        fetchPlanningData(blockId);
    });

    const deleteBtn = blockElement.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', () => removeBlock(blockId));

    const hintBtn = blockElement.querySelector('.btn-hint');
    hintBtn.addEventListener('click', () => {
        const hintBox = blockElement.querySelector('.block-hint-box');
        const isVisible = hintBox.style.display === 'flex';
        hintBox.style.display = isVisible ? 'none' : 'flex';
        hintBtn.style.background = isVisible ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.3)';
    });
}

function setupEventListeners() {
    document.getElementById('btnResetAll').addEventListener('click', resetAll);
    document.getElementById('btnExport').addEventListener('click', exportCSV);

    const btnSavePlan = document.getElementById('btnSavePlan');
    if (btnSavePlan) {
        btnSavePlan.addEventListener('click', savePlan);
    }

    // Help modal
    const helpBtn = document.getElementById('btnHelp');
    const helpModal = document.getElementById('helpModal');
    const helpClose = document.getElementById('helpModalClose');
    if (helpBtn && helpModal) {
        helpBtn.addEventListener('click', () => helpModal.style.display = 'flex');
        helpClose.addEventListener('click', () => helpModal.style.display = 'none');
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) helpModal.style.display = 'none';
        });
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
    const planningSection = blockElement.querySelector('.planning-section');
    const gaugesSection = blockElement.querySelector('.gauges-section');
    const messageDiv = blockElement.querySelector('.block-message');

    planningSection.style.display = 'none';
    gaugesSection.style.display = 'none';
    messageDiv.style.display = 'none';

    if (!block.planningData || !block.active) {
        statusBadge.textContent = 'INATIVO';
        statusBadge.classList.add('inactive');
        statusBadge.classList.remove('active');
        renderGlobalDashboard();
        return;
    }

    statusBadge.textContent = 'ATIVO';
    statusBadge.classList.remove('inactive');
    statusBadge.classList.add('active');

    planningSection.style.display = 'block';
    gaugesSection.style.display = 'block';

    renderPlanningTableBody(blockId);
    updateGauges(blockId);
    updateBlockHints(blockId); // Update AI hints
    renderGlobalDashboard();
    renderMap();
}

function renderPlanningTableBody(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement || !block.planningRows) return;

    const tbody = blockElement.querySelector('.planning-body');
    tbody.innerHTML = '';

    block.planningRows.forEach((row, index) => {
        // Fix #1: Show ALL rows (even those with no allocation this cycle)
        const tr = document.createElement('tr');
        tr.className = index < 3 ? `priority-rank-${index + 1}` : '';

        const negPct = row.negociacao_edit ? (row.negociacao_edit * 100).toFixed(0) : '0';
        const tipoCompra = row.circuito ? 'CIRCUITO' : 'UNITÁRIO';
        // Fix #5/#6: range bounds from base
        const rangeMin = row.range_minimo || 0;
        const rangeMax = row.range_maximo || row.totalFaces;

        tr.innerHTML = `
            <td class="cell-veiculo">${row.exibidores || '--'}</td>
            <td class="cell-formato">
                <div class="formato-main">${row.formato || '--'}</div>
                <div class="purchase-badges">
                    <span class="purchase-badge ${row.circuito ? 'purchase-badge-circuito' : 'purchase-badge-unitario'}">${tipoCompra}</span>
                    ${row.circuito ? `<span class="purchase-circuit-name">${row.circuito}</span>` : ''}
                </div>
            </td>
            <td class="cell-periodo">${row.periodicidade || '--'}</td>
            <td class="cell-number range-min">${rangeMin}</td>
            <td class="cell-number range-max">${rangeMax}</td>
            <td class="cell-week">
                <input type="number" class="inline-input input-total-faces" value="${row.totalFaces}" min="${rangeMin}" max="${rangeMax}" data-row="${index}" title="Mín: ${rangeMin} | Máx: ${rangeMax}">
            </td>
            <td class="cell-number">${row.index}</td>
            <td class="cell-material"><span class="material-dot ${row.digital ? 'digital' : 'off'}"></span>DIG</td>
            <td class="cell-material"><span class="material-dot ${row.estatico ? 'estatico' : 'off'}"></span>EST</td>
            <td class="cell-week">
                <input type="number" class="inline-input input-s1" value="${row.s1_edit}" min="0" max="${rangeMax}" data-row="${index}" data-field="s1_edit">
            </td>
            <td class="cell-week">
                <input type="number" class="inline-input input-s2" value="${row.s2_edit}" min="0" max="${rangeMax}" data-row="${index}" data-field="s2_edit">
            </td>
            <td class="cell-week">
                <input type="number" class="inline-input input-s3" value="${row.s3_edit}" min="0" max="${rangeMax}" data-row="${index}" data-field="s3_edit">
            </td>
            <td class="cell-week">
                <input type="number" class="inline-input input-s4" value="${row.s4_edit}" min="0" max="${rangeMax}" data-row="${index}" data-field="s4_edit">
            </td>
            <td class="cell-currency">${formatNumber(row.unitario_bruto_tabela)}</td>
            <td class="cell-currency cell-total-linha">${formatNumber(row.totalLinha)}</td>
            <td class="cell-neg">
                <input type="number" class="inline-input input-neg" value="${negPct}" min="0" max="100" data-row="${index}">
                <span class="neg-pct">%</span>
            </td>
            <td class="cell-currency">${formatNumber(row.ttNeg)}</td>
            <td class="cell-currency cell-budget-ideal">${formatNumber(row.budgetIdeal)}</td>
            <td class="cell-currency">${formatNumber(row.custoFace)}</td>
            <td class="cell-obs">
                <input type="text" class="inline-input input-obs" value="${row.obs || ''}" placeholder="..." data-row="${index}">
            </td>
        `;

        // Fix #6: Event listener for editable TT FACES (totalFaces)
        const faceInput = tr.querySelector('.input-total-faces');
        const validateFaceRange = (el) => {
            const val = parseInt(el.value) || 0;
            const min = parseInt(el.min) || 0;
            const max = parseInt(el.max) || Infinity;
            if (val < min || val > max) {
                el.classList.add('input-over-range');
                el.title = `⚠️ Fora do range permitido (Mín: ${min} | Máx: ${max})`;
            } else {
                el.classList.remove('input-over-range');
                el.title = `Mín: ${min} | Máx: ${max}`;
            }
        };
        faceInput.addEventListener('change', (e) => {
            const rowIdx = parseInt(e.target.dataset.row);
            const row = block.planningRows[rowIdx];
            row.totalFaces = parseInt(e.target.value) || 0;
            row.totalFaces = normalizeTotalFaces(row);
            e.target.value = row.totalFaces;
            validateFaceRange(e.target);
            // Predictable manual edit: only this line is redistributed by week profile.
            distributeFacesAcrossWeeks(row, row.totalFaces);
            recalculatePlanningRows(block);
            renderPlanningTableBody(blockId);
            updateGauges(blockId);
            updateConsolidated();
        });
        faceInput.addEventListener('input', validateFaceRange.bind(null, faceInput));
        validateFaceRange(faceInput);

        // Inline input events for S1-S4 weeks with min/max validation
        tr.querySelectorAll('.input-s1, .input-s2, .input-s3, .input-s4').forEach(input => {
            const validateRange = (el) => {
                const val = parseInt(el.value) || 0;
                const max = parseInt(el.max) || Infinity;
                if (val > max) {
                    el.classList.add('input-over-range');
                    el.title = `⚠️ Acima do máximo permitido (${max} faces)`;
                } else {
                    el.classList.remove('input-over-range');
                    el.title = '';
                }
            };
            input.addEventListener('change', (e) => {
                const rowIdx = parseInt(e.target.dataset.row);
                const field = e.target.dataset.field;
                block.planningRows[rowIdx][field] = parseInt(e.target.value) || 0;
                validateRange(e.target);
                recalculatePlanningRows(block);
                const totalFacesInput = tr.querySelector('.input-total-faces');
                if (totalFacesInput) {
                    totalFacesInput.value = block.planningRows[rowIdx].totalFaces;
                    validateFaceRange(totalFacesInput);
                }
                updatePlanningTotals(blockId);
                updateGauges(blockId);
                updateConsolidated();
            });
            input.addEventListener('input', (e) => {
                const rowIdx = parseInt(e.target.dataset.row);
                const field = e.target.dataset.field;
                block.planningRows[rowIdx][field] = parseInt(e.target.value) || 0;
                validateRange(e.target);
                recalculatePlanningRows(block);
                const totalFacesInput = tr.querySelector('.input-total-faces');
                if (totalFacesInput) {
                    totalFacesInput.value = block.planningRows[rowIdx].totalFaces;
                    validateFaceRange(totalFacesInput);
                }
                updatePlanningTotals(blockId);
                updateGauges(blockId);
            });
            // Validate immediately on render (catches pre-filled over-limit values)
            validateRange(input);
        });

        tr.querySelector('.input-neg').addEventListener('change', (e) => {
            const rowIdx = parseInt(e.target.dataset.row);
            const pct = parseFloat(e.target.value) || 0;
            block.planningRows[rowIdx].negociacao_edit = pct / 100;
            recalculatePlanningRows(block);
            renderPlanningTableBody(blockId);
            updateGauges(blockId);
            updateConsolidated();
        });

        tr.querySelector('.input-obs').addEventListener('change', (e) => {
            const rowIdx = parseInt(e.target.dataset.row);
            block.planningRows[rowIdx].obs = e.target.value;
        });

        tbody.appendChild(tr);
    });

    // Update totals footer
    updatePlanningTotals(blockId);
}

function updatePlanningTotals(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement || !block.planningRows) return;

    const rows = block.planningRows;
    const totals = {
        pesoFmt: rows.reduce((s, r) => s + (Number(r.pesos) || 0), 0),
        rangeMin: rows.reduce((s, r) => s + (Number(r.range_minimo) || 0), 0),
        rangeMax: rows.reduce((s, r) => s + (Number(r.range_maximo) > 0 ? Number(r.range_maximo) : (Number(r.maxFaces) || 0)), 0),
        faces: rows.reduce((s, r) => s + (Number(r.totalFaces) || 0), 0),
        index: rows.reduce((s, r) => s + (Number(r.index) || 0), 0),
        s1: rows.reduce((s, r) => s + (r.s1_edit || 0), 0),
        s2: rows.reduce((s, r) => s + (r.s2_edit || 0), 0),
        s3: rows.reduce((s, r) => s + (r.s3_edit || 0), 0),
        s4: rows.reduce((s, r) => s + (r.s4_edit || 0), 0),
        tabela: rows.reduce((s, r) => s + r.unitario_bruto_tabela, 0),
        totalLinha: rows.reduce((s, r) => s + (r.totalLinha || 0), 0),
        neg: rows.reduce((s, r) => s + r.ttNeg, 0),
        budgetIdeal: rows.reduce((s, r) => s + r.budgetIdeal, 0),
        custoFace: rows.reduce((s, r) => s + r.custoFace, 0)
    };

    blockElement.querySelector('.total-faces').textContent = totals.rangeMin;
    blockElement.querySelector('.total-faces-max').textContent = totals.rangeMax;
    blockElement.querySelector('.total-tt-faces').textContent = totals.faces;
    blockElement.querySelector('.total-index').textContent = totals.index.toFixed(2);
    blockElement.querySelector('.total-s1').textContent = totals.s1;
    blockElement.querySelector('.total-s2').textContent = totals.s2;
    blockElement.querySelector('.total-s3').textContent = totals.s3;
    blockElement.querySelector('.total-s4').textContent = totals.s4;
    blockElement.querySelector('.total-tabela').textContent = formatNumber(totals.tabela);
    blockElement.querySelector('.total-linha').textContent = formatNumber(totals.totalLinha);
    blockElement.querySelector('.total-neg').textContent = formatNumber(totals.neg);
    blockElement.querySelector('.total-budget-ideal').textContent = formatNumber(totals.budgetIdeal);
    blockElement.querySelector('.total-custo-face').textContent = formatNumber(totals.custoFace);
}

// ============================================
// GAUGE UPDATES
// ============================================
function updateGauges(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement || !block.planningRows) return;

    updateExposureGauge(block, blockElement);
    updateEfficiencyGauge(block, blockElement);
}

function updateExposureGauge(block, blockElement) {
    const rows = block.planningRows;

    // Fix #5: Use range_minimo and range_maximo from the base for min/max display
    let totalMin = 0, totalMax = 0, totalMedian = 0;

    rows.forEach(row => {
        const rowMin = Number(row.range_minimo) || 0;
        const rowMax = Number(row.range_maximo) > 0 ? Number(row.range_maximo) : (Number(row.maxFaces) || 0);
        totalMin += rowMin;
        totalMax += rowMax;
        // Median: midpoint between range_minimo and range_maximo
        totalMedian += Math.round((rowMin + rowMax) / 2);
    });

    blockElement.querySelector('.exp-total-min').textContent = totalMin;
    blockElement.querySelector('.exp-total-max').textContent = totalMax;
    blockElement.querySelector('.exp-total-median').textContent = totalMedian;

    // Exposure gauge: allocated faces vs. total maximum capacity in the current cycle.
    const totalAllocated = rows.reduce((s, r) => s + (r.s1_edit || 0) + (r.s2_edit || 0) + (r.s3_edit || 0) + (r.s4_edit || 0), 0);
    const maxPossible = totalMax;
    const exposureRatio = maxPossible > 0 ? totalAllocated / maxPossible : 0;
    const exposurePercent = Math.min(Math.max(exposureRatio * 100, 2), 98);

    blockElement.querySelector('.exp-gauge-value').textContent = `${totalAllocated} / ${maxPossible} faces`;
    const expCursor = blockElement.querySelector('.exposure-cursor');
    expCursor.style.left = `${exposurePercent}%`;

    // Color feedback
    if (exposureRatio > 0.75) {
        expCursor.style.backgroundColor = '#10B981'; // green - good coverage
    } else if (exposureRatio > 0.4) {
        expCursor.style.backgroundColor = '#F59E0B'; // yellow - moderate
    } else {
        expCursor.style.backgroundColor = '#EF4444'; // red - under-exposed
    }
}

function updateEfficiencyGauge(block, blockElement) {
    const rows = block.planningRows;

    // CPF range across active rows: MIN of cpf_minimo and MAX of cpf_maximo
    // (sum would produce a meaningless aggregate that inflates with row count).
    let cpfMin = Infinity, cpfMax = 0;
    let hasActiveRow = false;

    rows.forEach(row => {
        if (!row.facesUsadas || row.facesUsadas === 0) return;
        hasActiveRow = true;

        const rowCpfMin = (row.cpf_minimo && row.cpf_minimo > 0) ? row.cpf_minimo : (row.custoFace || 0);
        const rowCpfMax = (row.cpf_maximo && row.cpf_maximo > 0) ? row.cpf_maximo : (row.unitario_bruto_tabela || 0);

        if (rowCpfMin > 0) cpfMin = Math.min(cpfMin, rowCpfMin);
        if (rowCpfMax > 0) cpfMax = Math.max(cpfMax, rowCpfMax);
    });

    if (!hasActiveRow || cpfMin === Infinity) cpfMin = 0;

    blockElement.querySelector('.eff-total-min').textContent = formatNumber(cpfMin);
    blockElement.querySelector('.eff-total-max').textContent = formatNumber(cpfMax);

    // Efficiency gauge: composite of budget utilization + negotiation savings
    const budget = block.budget || 0;
    const totalNeg = rows.reduce((s, r) => s + r.ttNeg, 0);
    const totalTabela = rows.reduce((s, r) => s + r.totalLinha, 0);

    // Efficiency dimensions:
    // 1) Negotiation savings: primary driver (0 to 100%)
    const savingsRatio = totalTabela > 0 ? 1 - (totalNeg / totalTabela) : 0;
    
    // 2) Budget Adherence: penalty if over budget (only applies when budget is set)
    const budgetRatio = budget > 0 ? totalNeg / budget : 0;
    const overBudget = budget > 0 && budgetRatio > 1.05; // 5% grace margin

    // Calculate efficiency score:
    // Base score is savings % × 100 (e.g. 30% savings = 60 efficiency score baseline)
    // Plus a bonus for staying within budget.
    let effPercent;
    
    if (totalTabela === 0) {
        effPercent = 2;
    } else {
        // Efficiency = (Savings Ratio * 80) + (Budget Adherence * 20)
        // This ensures that increasing discount ALWAYS increases efficiency.
        const savingsScore = savingsRatio * 80;
        const adherenceScore = overBudget ? 0 : 20;
        effPercent = savingsScore + adherenceScore;
    }

    effPercent = Math.min(Math.max(effPercent, 2), 98);

    // Label
    const remaining = budget - totalNeg;
    const savingsPctText = (savingsRatio * 100).toFixed(0);
    const usagePctText = (budgetRatio * 100).toFixed(0);
    let remainingLabel;
    if (overBudget) {
        remainingLabel = `${formatCurrency(totalNeg)} (⚠️ ${usagePctText}% do budget)`;
    } else {
        remainingLabel = `${formatCurrency(totalNeg)} neg. (${savingsPctText}% de economia)`;
    }

    blockElement.querySelector('.eff-gauge-value').textContent = remainingLabel;
    const effCursor = blockElement.querySelector('.efficiency-cursor');
    effCursor.style.left = `${effPercent}%`;

    // Color feedback
    if (overBudget) {
        effCursor.style.backgroundColor = '#EF4444'; // red - over budget
    } else if (effPercent >= 70) {
        effCursor.style.backgroundColor = '#10B981'; // green - strong efficiency
    } else if (effPercent >= 40) {
        effCursor.style.backgroundColor = '#F59E0B'; // yellow - moderate
    } else {
        effCursor.style.backgroundColor = '#94A3B8'; // gray - low usage
    }
}

// ============================================
// HINT SYSTEM LOGIC
// ============================================
function updateBlockHints(blockId) {
    const block = getBlockById(blockId);
    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (!blockElement || !block.planningRows) return;

    const hintBtn = blockElement.querySelector('.btn-hint');
    const hintBox = blockElement.querySelector('.block-hint-box');
    const hintText = blockElement.querySelector('.hint-text');

    const budget = block.budget || 0;
    const totalNeg = block.planningRows.reduce((s, r) => s + r.ttNeg, 0);
    const totalTabela = block.planningRows.reduce((s, r) => s + r.totalLinha, 0);
    const facesAllocated = block.planningRows.reduce((s, r) => s + (r.s1_edit || 0) + (r.s2_edit || 0) + (r.s3_edit || 0) + (r.s4_edit || 0), 0);
    const totalAvailable = block.planningRows.reduce((s, r) => s + (r.range_maximo || r.totalFaces || 0), 0);

    const savingsRatio = totalTabela > 0 ? 1 - (totalNeg / totalTabela) : 0;
    const exposureRatio = totalAvailable > 0 ? facesAllocated / totalAvailable : 0;
    const budgetRatio = budget > 0 ? totalNeg / budget : 0;

    let advice = "";
    let priority = 0; // 0: low, 1: med, 2: high

    if (budgetRatio > 1.05) {
        advice = "⚠️ Seu plano está acima do budget. Tente negociar descontos maiores nos veículos de maior peso ou reduza a quantidade de faces nos formatos menos estratégicos.";
        priority = 2;
    } else if (exposureRatio < 0.3) {
        advice = "💡 A exposição está baixa para esta praça. Considere aumentar a quantidade de faces para garantir cobertura mínima, ou foque em formatos de maior impacto.";
        priority = 1;
    } else if (savingsRatio < 0.1) {
        advice = "📉 Eficiência pode melhorar. Tente negociar pelo menos 15% de desconto para este plano de mídia.";
    } else if (budgetRatio < 0.7) {
        advice = "💰 Sobrou budget significativo. Você pode aumentar a frequência (semanas) ou contratar mais faces para dominar a praça.";
        priority = 1;
    } else {
        advice = "✨ Plano equilibrado! A relação entre custo, negociação e exposição está dentro dos parâmetros ideais.";
    }

    hintText.textContent = advice;
    hintBtn.style.display = 'block';
    
    // Auto-show hint box if priority is high or if it's the first render
    if (priority >= 2 && hintBox.style.display === 'none') {
        hintBox.style.display = 'flex';
    }
}

// ============================================
// CONSOLIDATED TABLE
// ============================================
function updateConsolidated() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.planningRows);

    const totalBudget = activeBlocks.reduce((sum, b) => sum + (b.budget || 0), 0);
    document.getElementById('totalCard').textContent = formatCurrency(totalBudget);

    const tbody = document.getElementById('consolidatedTableBody');
    tbody.innerHTML = '';

    if (activeBlocks.length === 0) {
        tbody.innerHTML = '<tr class="empty-state"><td colspan="8">Nenhuma mídia configurada ainda</td></tr>';
    } else {
        activeBlocks.forEach(block => {
            const totalFaces = block.planningRows.reduce((s, r) => s + r.totalFaces, 0);
            const totalNeg = block.planningRows.reduce((s, r) => s + (r.ttNeg || 0), 0);
            const totalRecomendado = block.planningRows.reduce((s, r) => s + (r.budgetIdeal || 0), 0);
            const statusText = totalNeg <= block.budget ? '✅ OK' : '⚠️ Acima';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Plano ${block.id}</td>
                <td>${block.praca || '--'}</td>
                <td>${block.taxonomia || '--'}</td>
                <td>${formatCurrency(block.budget)}</td>
                <td>${block.planningRows.length} formatos</td>
                <td>${totalFaces}</td>
                <td>${formatCurrency(totalRecomendado)}</td>
                <td>${statusText}</td>
            `;
            tbody.appendChild(row);
        });
    }

    // Update map whenever consolidated data changes
    renderMap();
}

// ============================================
// GLOBAL ANALYTICS DASHBOARD
// ============================================
let globalCharts = []; // chart instances for cleanup

function renderGlobalDashboard() {
    const dashboard = document.getElementById('globalDashboard');
    if (!dashboard) return;

    // Aggregate rows from ALL active blocks
    const allRows = [];
    state.mediaBlocks.forEach(block => {
        if (block.active && block.planningRows) {
            block.planningRows.filter(r => r.facesUsadas > 0).forEach(r => allRows.push(r));
        }
    });

    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.planningRows).length;

    if (activeBlocks === 0) {
        dashboard.style.display = 'none';
        return;
    }
    dashboard.style.display = 'block';

    // — KPI values —
    const totalFaces = allRows.reduce((s, r) => s + r.facesUsadas, 0);
    const totalInvest = allRows.reduce((s, r) => s + r.ttNeg, 0);
    const cpfMedio = totalFaces > 0 ? totalInvest / totalFaces : 0;

    document.getElementById('gKpiFaces').textContent = totalFaces;
    document.getElementById('gKpiInvest').textContent = formatCurrency(totalInvest);
    document.getElementById('gKpiCpf').textContent = formatCurrency(cpfMedio);
    document.getElementById('gKpiRecortes').textContent = activeBlocks;

    // Destroy old charts before re-rendering
    globalCharts.forEach(c => c.destroy());
    globalCharts = [];

    const chartColors = [
        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
        '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
        '#D946EF', '#84CC16', '#0EA5E9', '#F43F5E'
    ];

    // Doughnut opts with % in tooltips
    const doughnutOpts = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: { color: '#64748B', font: { size: 10 }, boxWidth: 12, padding: 10 }
            },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                        return ` ${ctx.label}: ${formatCurrency(ctx.raw)} (${pct}%)`;
                    }
                }
            }
        }
    };

    // — Chart 1: Doughnut by Formato —
    const formatoGroups = {};
    allRows.forEach(r => { const k = r.formato || 'Outros'; formatoGroups[k] = (formatoGroups[k] || 0) + r.ttNeg; });
    const fmtLabels = Object.keys(formatoGroups);
    const fmtCanvas = document.getElementById('gChartFormato');
    if (fmtCanvas) {
        globalCharts.push(new Chart(fmtCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: fmtLabels,
                datasets: [{ data: Object.values(formatoGroups), backgroundColor: chartColors, borderWidth: 2, borderColor: '#fff' }]
            },
            options: doughnutOpts
        }));
    }

    // — Chart 2: Doughnut by Exibidor —
    const exibGroups = {};
    allRows.forEach(r => { const k = r.exibidores || 'Outros'; exibGroups[k] = (exibGroups[k] || 0) + r.ttNeg; });
    const exibLabels = Object.keys(exibGroups);
    const exibCanvas = document.getElementById('gChartExibidor');
    if (exibCanvas) {
        globalCharts.push(new Chart(exibCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: exibLabels,
                datasets: [{ data: Object.values(exibGroups), backgroundColor: chartColors, borderWidth: 2, borderColor: '#fff' }]
            },
            options: doughnutOpts
        }));
    }

    // — Chart 3: Horizontal Bar — Investment by Formato —
    const barCanvas = document.getElementById('gChartBarFormato');
    if (barCanvas) {
        globalCharts.push(new Chart(barCanvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: fmtLabels,
                datasets: [{
                    data: Object.values(formatoGroups),
                    backgroundColor: chartColors.slice(0, fmtLabels.length).map(c => c + 'CC'),
                    borderColor: chartColors.slice(0, fmtLabels.length),
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                                return ` ${formatCurrency(ctx.raw)} (${pct}%)`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94A3B8', font: { size: 9 }, callback: (v) => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) },
                        grid: { color: '#F1F5F9' }
                    },
                    y: { ticks: { color: '#1E293B', font: { size: 10 } }, grid: { display: false } }
                }
            }
        }));
    }
}


// ============================================
// GEOGRAPHIC MAP
// ============================================
let mapInstance = null;

const PRACA_COORDS = {
    'são paulo': [-23.5505, -46.6333], 'sao paulo': [-23.5505, -46.6333],
    'rio de janeiro': [-22.9068, -43.1729],
    'belo horizonte': [-19.9167, -43.9345],
    'brasília': [-15.7975, -47.8919], 'brasilia': [-15.7975, -47.8919],
    'curitiba': [-25.4284, -49.2733],
    'porto alegre': [-30.0346, -51.2177],
    'salvador': [-12.9714, -38.5014],
    'recife': [-8.0476, -34.8770],
    'fortaleza': [-3.7172, -38.5433],
    'manaus': [-3.1190, -60.0217],
    'belém': [-1.4558, -48.5024], 'belem': [-1.4558, -48.5024],
    'goiânia': [-16.6869, -49.2648], 'goiania': [-16.6869, -49.2648],
    'campinas': [-22.9099, -47.0626],
    'florianópolis': [-27.5954, -48.5480], 'florianopolis': [-27.5954, -48.5480],
    'vitória': [-20.3155, -40.3128], 'vitoria': [-20.3155, -40.3128],
    'cuiabá': [-15.6014, -56.0979], 'cuiaba': [-15.6014, -56.0979],
    'natal': [-5.7945, -35.2110],
    'campo grande': [-20.4697, -54.6201],
    'joão pessoa': [-7.1195, -34.8450], 'joao pessoa': [-7.1195, -34.8450],
    'maceió': [-9.6658, -35.7353], 'maceio': [-9.6658, -35.7353],
    'teresina': [-5.0920, -42.8038],
    'são luís': [-2.5297, -44.2825], 'sao luis': [-2.5297, -44.2825],
    'aracaju': [-10.9091, -37.0677],
    'londrina': [-23.3045, -51.1696],
    'ribeirão preto': [-21.1704, -47.8103], 'ribeirao preto': [-21.1704, -47.8103],
    'santos': [-23.9608, -46.3336],
    'sorocaba': [-23.5015, -47.4526],
    'uberlândia': [-18.9186, -48.2772], 'uberlandia': [-18.9186, -48.2772],
    'guarulhos': [-23.4538, -46.5333],
    'niterói': [-22.8833, -43.1036], 'niteroi': [-22.8833, -43.1036],
    'baixada santista': [-23.9608, -46.3336],
    'grande são paulo': [-23.5505, -46.6333], 'grande sao paulo': [-23.5505, -46.6333],
    'grande rio': [-22.9068, -43.1729],
    'grande bh': [-19.9167, -43.9345],
    'grande curitiba': [-25.4284, -49.2733],
    'grande recife': [-8.0476, -34.8770],
    'grande salvador': [-12.9714, -38.5014],
    'grande porto alegre': [-30.0346, -51.2177],
    'interior sp': [-22.3214, -49.0611],
    'litoral sp': [-23.9608, -46.3336]
};

function renderMap() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.planningRows);
    const mapSection = document.getElementById('mapSection');
    const mapContainer = document.getElementById('mapContainer');

    if (activeBlocks.length === 0) {
        if (mapSection) mapSection.style.display = 'none';
        return;
    }

    mapSection.style.display = 'block';

    // Collect praça data with totals
    const pracaData = {};
    activeBlocks.forEach(block => {
        const praca = (block.praca || '').toLowerCase().trim();
        if (!praca) return;
        const totalCost = block.planningRows.reduce((s, r) => s + r.ttNeg, 0);
        const totalFaces = block.planningRows.reduce((s, r) => s + r.facesUsadas, 0);
        if (!pracaData[praca]) pracaData[praca] = { cost: 0, faces: 0, label: block.praca };
        pracaData[praca].cost += totalCost;
        pracaData[praca].faces += totalFaces;
    });

    // Initialize or clear map
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    mapInstance = L.map(mapContainer).setView([-14.2350, -51.9253], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(mapInstance);

    // Add markers
    Object.entries(pracaData).forEach(([praca, data]) => {
        const coords = PRACA_COORDS[praca];
        if (!coords) return;

        const radius = Math.max(8, Math.min(30, Math.sqrt(data.cost / 1000)));

        L.circleMarker(coords, {
            radius: radius,
            fillColor: '#3B82F6',
            color: '#1E40AF',
            weight: 2,
            opacity: 0.9,
            fillOpacity: 0.6
        }).addTo(mapInstance)
            .bindPopup(`<b>${data.label}</b><br>Investimento: ${formatCurrency(data.cost)}<br>Faces: ${data.faces}`);
    });

    // Fit bounds if markers exist
    const validCoords = Object.keys(pracaData)
        .map(p => PRACA_COORDS[p])
        .filter(Boolean);
    if (validCoords.length > 0) {
        mapInstance.fitBounds(validCoords, { padding: [30, 30], maxZoom: 8 });
    }
}

// ============================================
// ACTIONS
// ============================================
function resetBlock(blockId) {
    const block = getBlockById(blockId);
    block.budget = null;
    block.campaignCycle = 4;
    block.taxonomia = null;
    block.praca = null;
    block.planningData = null;
    block.planningRows = null;
    block.active = false;

    const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
    if (blockElement) {
        blockElement.querySelectorAll('input[type="number"]').forEach(input => input.value = '');
        blockElement.querySelector('.input-campaign-cycle').value = '4';
        blockElement.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
    }

    updateBlockUI(blockId);
    updateConsolidated();
}

function resetAll() {
    if (!confirm('Tem certeza que deseja resetar tudo?')) return;
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

function exportCSV() {
    const activeBlocks = state.mediaBlocks.filter(b => b.active && b.planningRows);
    if (activeBlocks.length === 0) {
        alert('Nenhuma mídia configurada para exportar');
        return;
    }

    const headers = ['Plano', 'Veículo', 'Peso', 'Formato', 'Circuito', 'Periodicidade', 'Min', 'Max', 'TT Faces', 'Index', 'Digital', 'Estático', 'S1', 'S2', 'S3', 'S4', 'Tabela Unit.', 'Negociação %', 'TT Neg.', 'Recomendado', 'Custo/Face', 'OBS'];

    const rows = [];
    activeBlocks.forEach(block => {
        block.planningRows.forEach(row => {
            rows.push([
                `Plano ${block.id}`,
                row.exibidores || '',
                row.pesos || '',
                row.formato || '',
                row.circuito || '',
                row.periodicidade || '',
                row.range_minimo || 0,
                row.range_maximo || 0,
                row.totalFaces,
                row.index,
                row.digital ? 'Sim' : 'Não',
                row.estatico ? 'Sim' : 'Não',
                row.s1_edit || 0,
                row.s2_edit || 0,
                row.s3_edit || 0,
                row.s4_edit || 0,
                row.unitario_bruto_tabela,
                ((row.negociacao_edit || 0) * 100).toFixed(0) + '%',
                row.ttNeg,
                row.budgetIdeal,
                row.custoFace,
                row.obs || ''
            ]);
        });
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `planejamento_ooh_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function loadPlan(planId) {
    try {
        const response = await fetch(`${API_BASE}/plans/${planId}`);
        const result = await response.json();

        if (result.success && result.plan) {
            const planData = JSON.parse(result.plan.data);
            state.mediaBlocks = planData;
            state.nextBlockId = Math.max(...planData.map(b => b.id)) + 1;
            renderMediaBlocks();

            // Fix #12: Re-hydrate planning data for each block from the saved state or re-fetch
            for (const block of state.mediaBlocks) {
                if (block.praca && block.taxonomia) {
                    if (block.planningRows && block.planningRows.length > 0) {
                        // Saved plan already has planningRows – just mark as active and render
                        block.planningRows.forEach(row => {
                            row.totalFaces = normalizeTotalFaces(row);
                        });
                        recalculatePlanningRows(block);
                        block.active = true;
                        block.planningData = block.planningRows;
                        updateBlockUI(block.id);
                    } else {
                        // No planning rows saved — re-fetch from the API
                        await fetchPlanningData(block.id);
                    }
                }
            }

            updateConsolidated();
        }
    } catch (error) {
        console.error('Erro ao carregar plano:', error);
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
// UTILITIES
// ============================================
function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
    return 'R$ ' + Number(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function formatNumber(value) {
    if (value === null || value === undefined || isNaN(value)) return '0';
    return Number(value).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function formatExposure(value) {
    if (!value || isNaN(value)) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toFixed(0);
}

function showError(message) {
    alert('❌ ' + message);
}
