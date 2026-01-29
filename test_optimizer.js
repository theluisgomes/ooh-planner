
const budgetOptimizer = require('./services/budget-optimizer');

// Mock inventory item
const mockInventory = [
    {
        ID: 1,
        praca: 'SAO PAULO',
        uf: 'SP',
        formato: 'Relógio de Rua', // Should trigger high exposure
        digital: 1,
        estatico: 0,
        unitario_bruto_negociado: 1000,
        range_minimo: 10,
        range_maximo: 20
    }
];

const budget = 50000;
const campaignCycle = 4;

const result = budgetOptimizer.optimizeAllocation(budget, campaignCycle, mockInventory);

console.log('Result Status:', result.status);
console.log('Allocated Budget:', result.allocatedBudget);
console.log('Faces Count:', result.facesCount);
console.log('Exposicao Estimada:', result.exposicao_estimada);
console.log('Eficiencia:', result.eficiencia);

if (result.exposicao_estimada > 0 && result.eficiencia > 0) {
    console.log('SUCCESS: Exposure metrics are present.');
} else {
    console.log('FAILURE: Exposure metrics are missing or zero.');
}
