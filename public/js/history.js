document.addEventListener('DOMContentLoaded', async () => {
    // Check auth first
    try {
        const authResponse = await fetch('/api/check-auth');
        const authData = await authResponse.json();

        if (!authData.authenticated) {
            window.location.href = '/login.html';
            return;
        }

        // Update user greeting
        const greeting = document.querySelector('.user-greeting');
        if (greeting && authData.user) {
            greeting.textContent = `Olá, ${authData.user.username}`;
        }

        // Load plans
        loadPlans();

    } catch (error) {
        console.error('Auth check failed:', error);
    }

    // Logout handler
    document.getElementById('btnLogout').addEventListener('click', async () => {
        try {
            await fetch('/logout', { method: 'POST' });
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    });
});

async function loadPlans() {
    const tbody = document.getElementById('historyTableBody');

    try {
        const response = await fetch('/api/plans');
        const data = await response.json();

        if (data.success && data.plans.length > 0) {
            tbody.innerHTML = '';

            data.plans.forEach(plan => {
                const date = new Date(plan.created_at).toLocaleString('pt-BR');

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${plan.name}</strong></td>
                    <td><span style="color: #888; font-family: monospace;">#${plan.id}</span></td>
                    <td>${date}</td>
                    <td style="text-align: right;">
                        <button class="btn-load" onclick="loadPlan(${plan.id})">
                            <span class="material-icons" style="font-size: 14px; vertical-align: middle;">edit</span>
                            Editar
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="empty-state">
                        Nenhum plano salvo encontrado.<br>
                        <a href="/" style="color: var(--primary); text-decoration: none; margin-top: 10px; display: inline-block;">Criar novo plano</a>
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Failed to load plans:', error);
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color: #ef4444;">Erro ao carregar planos: ${error.message}</td></tr>`;
    }
}

function loadPlan(id) {
    if (confirm('Deseja carregar este plano? O trabalho atual não salvo será perdido.')) {
        window.location.href = `/?planId=${id}`;
    }
}
