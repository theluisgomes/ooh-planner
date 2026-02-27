/**
 * Budget Optimizer Service
 * 
 * Handles budget-driven optimization for OOH media planning.
 * Given a budget and campaign cycle, determines optimal face allocation
 * based on ROI and provides recommendations.
 */

class BudgetOptimizer {
    /**
     * Calculate ROI for a face
     * Uses a combination of price efficiency, quantity potential, and format type
     */
    calculateROI(face, campaignCycle) {
        const price = this.parseNumber(face.unitario_bruto_negociado);
        const avgQuantity = (this.parseNumber(face.range_minimo) + this.parseNumber(face.range_maximo)) / 2;

        // Price efficiency: lower price = higher score
        const priceEfficiency = 10000 / price; // Normalize to reasonable scale

        // Quantity potential: more faces available = higher reach
        const quantityScore = avgQuantity * campaignCycle;

        // Format multiplier: some formats are more valuable
        const formatMultiplier = this.getFormatMultiplier(face.formato);

        // Digital bonus: digital formats may have higher engagement
        const digitalBonus = this.parseNumber(face.digital) === 1 ? 1.2 : 1.0;

        // Peso from client ranking (1=0.9, 2=0.8, ... 12=0.02)
        // Default to 0.5 if no peso data available
        const peso = (face.pesos !== null && face.pesos !== undefined && face.pesos > 0)
            ? face.pesos
            : 0.5;

        // Combined ROI score — peso acts as primary weighting factor
        const roi = (priceEfficiency * 0.4 + quantityScore * 0.4) * formatMultiplier * digitalBonus * peso;

        return roi;
    }

    /**
     * Get format multiplier for ROI calculation
     */
    getFormatMultiplier(formato) {
        const formatLower = (formato || '').toLowerCase();

        if (formatLower.includes('outdoor')) return 1.3;
        if (formatLower.includes('led') || formatLower.includes('painel')) return 1.2;
        if (formatLower.includes('front')) return 1.1;
        if (formatLower.includes('toten')) return 1.0;

        return 1.0; // Default
    }

    /**
     * Get estimated exposure factor based on format/type
     * (Copied from BigQuery Service logic)
     */
    getExposureFactor(formato, digital, estatico) {
        const formatoLower = (formato || '').toLowerCase();
        // Convert to boolean explicitly (database stores as 0/1)
        const isDigital = Boolean(digital);
        const isEstatico = Boolean(estatico);

        if (formatoLower.includes('empena') || formatoLower.includes('painel')) return 50000;
        if (formatoLower.includes('metro') || formatoLower.includes('metrô')) return 45000;
        if (formatoLower.includes('aeroporto')) return 40000;
        if (formatoLower.includes('shopping')) return 35000;
        if (formatoLower.includes('parque')) return 30000;
        if (formatoLower.includes('abrigo') || formatoLower.includes('onibus') || formatoLower.includes('ônibus')) return isDigital ? 25000 : 20000;
        if (formatoLower.includes('mub') || formatoLower.includes('banca')) return 22000;
        if (formatoLower.includes('totem')) return isDigital ? 28000 : 18000;
        if (formatoLower.includes('circuito')) return 20000;
        if (formatoLower.includes('backbus') || formatoLower.includes('back bus')) return 18000;
        if (formatoLower.includes('backseat') || formatoLower.includes('back seat')) return 8000;
        if (formatoLower.includes('envelopamento')) return 35000;
        if (formatoLower.includes('exterior')) return 25000;
        return isDigital ? 15000 : 12000;
    }

    /**
     * Parse numeric string from Brazilian format (e.g., "1.234,56" -> 1234.56)
     */
    parseNumber(value) {
        if (typeof value === 'number') return value;
        if (!value) return 0;

        const str = String(value);
        // Remove dots (thousand separator) and replace comma with dot
        const normalized = str.replace(/\./g, '').replace(',', '.');
        return parseFloat(normalized) || 0;
    }

    /**
     * Format number to Brazilian currency
     */
    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }

    /**
     * Prioritize faces by ROI
     */
    prioritizeFaces(inventory, campaignCycle) {
        return inventory
            .map(face => ({
                ...face,
                roi: this.calculateROI(face, campaignCycle),
                unitPrice: this.parseNumber(face.unitario_bruto_negociado)
            }))
            .sort((a, b) => b.roi - a.roi); // Descending order (highest ROI first)
    }

    /**
     * Allocate budget to faces using greedy algorithm
     */
    allocateBudgetToFaces(budget, inventory, campaignCycle) {
        const rankedFaces = this.prioritizeFaces(inventory, campaignCycle);

        let remainingBudget = budget;
        const selectedFaces = [];
        let totalFacesCount = 0;

        for (const face of rankedFaces) {
            const minQuantity = this.parseNumber(face.range_minimo);
            const unitPrice = this.parseNumber(face.unitario_bruto_negociado);

            // Calculate cost for minimum quantity
            const faceCost = unitPrice * minQuantity;

            if (faceCost <= remainingBudget && minQuantity > 0) {
                selectedFaces.push({
                    id: face.ID,
                    praca: face.praca,
                    uf: face.uf,
                    exibidores: face.exibidores,
                    formato: face.formato,
                    taxonomia: face.taxonomia,
                    digital: face.digital,
                    estatico: face.estatico,
                    ranking: face.ranking || null,
                    pesos: face.pesos || null,
                    quantity: minQuantity,
                    unitPrice: unitPrice,
                    totalCost: faceCost,
                    roi: face.roi.toFixed(2),
                    priority: selectedFaces.length + 1
                });

                remainingBudget -= faceCost;
                totalFacesCount += minQuantity;
            }

            // Stop if budget is exhausted
            if (remainingBudget < 1000) break; // Threshold for remaining
        }

        return {
            selectedFaces,
            allocatedBudget: budget - remainingBudget,
            remainingBudget,
            facesCount: totalFacesCount
        };
    }

    /**
     * Calculate ideal budget for a given market/filters
     */
    calculateIdealBudget(inventory, campaignCycle) {
        // Calculate 75th percentile of potential spend
        // This represents a "good coverage" budget

        const rankedFaces = this.prioritizeFaces(inventory, campaignCycle);
        const topFaces = rankedFaces.slice(0, Math.ceil(rankedFaces.length * 0.75));

        const idealBudget = topFaces.reduce((sum, face) => {
            const minQuantity = this.parseNumber(face.range_minimo);
            const unitPrice = this.parseNumber(face.unitario_bruto_negociado);
            return sum + (unitPrice * minQuantity);
        }, 0);

        return idealBudget;
    }

    /**
     * Main optimization function
     * @param {number} budget - Total budget available
     * @param {number} campaignCycle - Campaign duration in weeks
     * @param {Array} inventory - Inventory data from BigQuery
     */
    optimizeAllocation(budget, campaignCycle, inventory) {
        try {
            if (!inventory || inventory.length === 0) {
                return {
                    status: 'error',
                    message: 'Nenhuma face disponível com os filtros aplicados'
                };
            }

            // Calculate ideal budget for reference
            const idealBudget = this.calculateIdealBudget(inventory, campaignCycle);

            // Allocate budget to faces
            const allocation = this.allocateBudgetToFaces(budget, inventory, campaignCycle);

            // Determine budget status
            let status;
            let statusMessage;

            if (budget < idealBudget * 0.5) {
                status = 'insufficient';
                statusMessage = `⚠️ Budget insuficiente. Recomendado: ${this.formatCurrency(idealBudget)}`;
            } else if (budget > idealBudget * 1.5) {
                status = 'excessive';
                statusMessage = `💡 Budget em excesso. Sobrando: ${this.formatCurrency(allocation.remainingBudget)}`;
            } else {
                status = 'sufficient';
                statusMessage = `✅ Budget adequado para ${allocation.facesCount} faces`;
            }

            // Calculate total exposure for selected faces
            const totalExposure = allocation.selectedFaces.reduce((sum, face) => {
                const exposureFactor = this.getExposureFactor(face.formato, face.digital, face.estatico);
                return sum + (face.quantity * exposureFactor);
            }, 0);

            const eficiencia = allocation.allocatedBudget > 0 ? totalExposure / allocation.allocatedBudget : 0;

            return {
                status,
                statusMessage,
                idealBudget,
                allocatedBudget: allocation.allocatedBudget,
                remainingBudget: allocation.remainingBudget,
                facesCount: allocation.facesCount,
                recommendedFaces: allocation.selectedFaces,
                budgetAdequacy: {
                    minRecommended: idealBudget * 0.5,
                    maxRecommended: idealBudget * 1.5,
                    ideal: idealBudget
                },
                totalInventorySize: inventory.length,
                exposicao_estimada: totalExposure,
                eficiencia: eficiencia
            };

        } catch (error) {
            console.error('Error in optimizeAllocation:', error);
            return {
                status: 'error',
                message: 'Erro ao otimizar alocação de budget: ' + error.message
            };
        }
    }
}

module.exports = new BudgetOptimizer();
