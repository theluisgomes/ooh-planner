/**
 * Recommendation Service
 * 
 * Generates ideal OOH media plans based on core inputs (Budget, Ciclo, Taxonomia, Praça)
 * and calculates efficiency metrics comparing manual adjustments vs ideal recommendations.
 */

const budgetOptimizer = require('./budget-optimizer');

class RecommendationService {
    /**
     * Get ideal plan recommendation based on 4 core inputs
     * @param {number} budget - Total budget available
     * @param {number} campaignCycle - Campaign duration in weeks
     * @param {string} taxonomia - Taxonomy filter
     * @param {string} praca - City/market filter
     * @param {Array} inventory - Full inventory dataset
     * @returns {Object} Ideal plan with format-level recommendations
     */
    getIdealPlan(budget, campaignCycle, taxonomia, praca, inventory) {
        try {
            // Filter inventory by taxonomia and praça
            const filteredInventory = this.filterInventory(inventory, taxonomia, praca);

            if (filteredInventory.length === 0) {
                return {
                    status: 'error',
                    message: `Nenhum inventário disponível para Taxonomia: ${taxonomia}, Praça: ${praca}`
                };
            }

            // Get optimized allocation using existing budget optimizer
            const optimization = budgetOptimizer.optimizeAllocation(
                budget,
                campaignCycle,
                filteredInventory
            );

            if (optimization.status === 'error') {
                return optimization;
            }

            // Group recommended faces by format type
            const formatGroups = this.groupByFormat(optimization.recommendedFaces);

            // Calculate totals per format
            const formats = Object.keys(formatGroups).map(formatName => {
                const faces = formatGroups[formatName];
                const totalQty = faces.reduce((sum, f) => sum + f.quantity, 0);
                const totalCost = faces.reduce((sum, f) => sum + f.totalCost, 0);
                const avgUnitCost = totalCost / totalQty;
                const totalExposure = faces.reduce((sum, f) => {
                    const exposureFactor = budgetOptimizer.getExposureFactor(
                        f.formato,
                        f.digital,
                        f.estatico
                    );
                    return sum + (f.quantity * exposureFactor);
                }, 0);

                return {
                    name: formatName,
                    recommendedQty: totalQty,
                    totalCost: totalCost,
                    avgUnitCost: avgUnitCost,
                    totalExposure: totalExposure,
                    faces: faces // Keep individual faces for later use
                };
            });

            // Sort by total cost (descending) to show most significant formats first
            formats.sort((a, b) => b.totalCost - a.totalCost);

            return {
                status: 'success',
                taxonomia,
                praca,
                budget,
                campaignCycle,
                formats,
                totalCost: optimization.allocatedBudget,
                totalExposure: optimization.exposicao_estimada,
                totalFaces: optimization.facesCount,
                efficiency: optimization.eficiencia,
                remainingBudget: optimization.remainingBudget
            };

        } catch (error) {
            console.error('Error generating ideal plan:', error);
            return {
                status: 'error',
                message: 'Erro ao gerar plano ideal: ' + error.message
            };
        }
    }

    /**
     * Filter inventory by taxonomia and praça
     */
    filterInventory(inventory, taxonomia, praca) {
        return inventory.filter(item => {
            const matchesTaxonomia = taxonomia === 'Tudo' ||
                (item.taxonomia && item.taxonomia.toLowerCase() === taxonomia.toLowerCase());

            const matchesPraca = praca === 'Tudo' ||
                (item.praca && item.praca.toLowerCase() === praca.toLowerCase());

            return matchesTaxonomia && matchesPraca;
        });
    }

    /**
     * Group faces by format type
     */
    groupByFormat(faces) {
        const groups = {};

        faces.forEach(face => {
            const formatName = face.formato || 'Outros';

            if (!groups[formatName]) {
                groups[formatName] = [];
            }

            groups[formatName].push(face);
        });

        return groups;
    }

    /**
     * Calculate efficiency metrics comparing manual plan vs ideal plan
     * @param {Object} manualPlan - User's manually adjusted plan
     * @param {Object} idealPlan - System-generated ideal plan
     * @returns {Object} Efficiency comparison metrics
     */
    calculateEfficiency(manualPlan, idealPlan) {
        try {
            // Calculate manual plan metrics
            const manualTotalCost = manualPlan.formats.reduce((sum, f) => {
                // Find corresponding format in ideal plan to get unit cost
                const idealFormat = idealPlan.formats.find(ideal => ideal.name === f.name);
                if (!idealFormat) return sum;

                return sum + (f.adjustedQty * idealFormat.avgUnitCost);
            }, 0);

            const manualTotalExposure = manualPlan.formats.reduce((sum, f) => {
                const idealFormat = idealPlan.formats.find(ideal => ideal.name === f.name);
                if (!idealFormat || !idealFormat.faces || idealFormat.faces.length === 0) return sum;

                // Use first face as representative for exposure factor
                const representativeFace = idealFormat.faces[0];
                const exposureFactor = budgetOptimizer.getExposureFactor(
                    representativeFace.formato,
                    representativeFace.digital,
                    representativeFace.estatico
                );

                return sum + (f.adjustedQty * exposureFactor);
            }, 0);

            const manualEfficiency = manualTotalCost > 0 ? manualTotalExposure / manualTotalCost : 0;

            // Ideal plan metrics (already calculated)
            const idealEfficiency = idealPlan.efficiency ||
                (idealPlan.totalCost > 0 ? idealPlan.totalExposure / idealPlan.totalCost : 0);

            // Calculate efficiency ratio
            const efficiencyRatio = idealEfficiency > 0 ? manualEfficiency / idealEfficiency : 0;

            // Determine status
            let status;
            let statusMessage;

            if (efficiencyRatio >= 0.95) {
                status = 'efficient';
                statusMessage = '✅ Plano eficiente - Próximo ao ideal';
            } else if (efficiencyRatio >= 0.8) {
                status = 'acceptable';
                statusMessage = '⚠️ Plano aceitável - Ligeiramente abaixo do ideal';
            } else {
                status = 'inefficient';
                statusMessage = '❌ Plano ineficiente - Significativamente abaixo do ideal';
            }

            return {
                status,
                statusMessage,
                manualEfficiency,
                idealEfficiency,
                efficiencyRatio,
                manualTotalCost,
                manualTotalExposure,
                idealTotalCost: idealPlan.totalCost,
                idealTotalExposure: idealPlan.totalExposure,
                percentageOfIdeal: (efficiencyRatio * 100).toFixed(1)
            };

        } catch (error) {
            console.error('Error calculating efficiency:', error);
            return {
                status: 'error',
                message: 'Erro ao calcular eficiência: ' + error.message
            };
        }
    }

    /**
     * Generate detailed player/format list based on manual adjustments
     * @param {Object} manualPlan - User's adjusted quantities
     * @param {Object} idealPlan - Original ideal plan (contains face details)
     * @returns {Array} Detailed list of players/faces to allocate
     */
    generatePlayerList(manualPlan, idealPlan) {
        try {
            const playerList = [];

            manualPlan.formats.forEach(manualFormat => {
                // Find corresponding ideal format
                const idealFormat = idealPlan.formats.find(f => f.name === manualFormat.name);

                if (!idealFormat || !idealFormat.faces) return;

                const targetQty = manualFormat.adjustedQty;
                const idealQty = idealFormat.recommendedQty || 0;
                let allocatedQty = 0;

                // Calculate discount percentage
                // Positive = discount (negotiated < ideal)
                // Negative = premium (negotiated > ideal)
                const discountPercent = idealQty > 0
                    ? ((idealQty - targetQty) / idealQty * 100).toFixed(1)
                    : 0;

                // Allocate faces in priority order until we reach target quantity
                for (const face of idealFormat.faces) {
                    if (allocatedQty >= targetQty) break;

                    const qtyToAllocate = Math.min(
                        face.quantity,
                        targetQty - allocatedQty
                    );

                    if (qtyToAllocate > 0) {
                        playerList.push({
                            priority: face.priority,
                            praca: face.praca,
                            uf: face.uf,
                            exibidores: face.exibidores,
                            formato: face.formato,
                            taxonomia: face.taxonomia,
                            idealQuantity: idealQty,           // NEW: Ideal recommendation
                            negotiatedQuantity: targetQty,     // NEW: Manual adjustment
                            discount: parseFloat(discountPercent), // NEW: Discount %
                            quantity: qtyToAllocate,           // Allocated quantity for this player
                            unitPrice: face.unitPrice,
                            totalCost: qtyToAllocate * face.unitPrice,
                            roi: face.roi,
                            digital: face.digital,
                            estatico: face.estatico
                        });

                        allocatedQty += qtyToAllocate;
                    }
                }
            });

            // Sort by priority
            playerList.sort((a, b) => a.priority - b.priority);

            return playerList;

        } catch (error) {
            console.error('Error generating player list:', error);
            return [];
        }
    }
}

module.exports = new RecommendationService();
