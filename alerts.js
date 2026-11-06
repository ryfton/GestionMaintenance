(function () {
  'use strict';

  const pageName = window.location.pathname.split('/').pop() || 'dashboard.html';
  const isDashboard = pageName === 'dashboard.html';
  const isStockPage = pageName === 'stock.html';
  const isInstallationsPage = pageName === 'installations.html';
  if (!isDashboard && !isStockPage && !isInstallationsPage) return;

  const db = () => window.supabaseClient;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const today = () => {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const dateLabel = (value) => value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR')
    : 'Date non définie';

  function installStyles() {
    if (document.getElementById('alertsModuleStyles')) return;
    const style = document.createElement('style');
    style.id = 'alertsModuleStyles';
    style.textContent = `
      .app-alerts { margin: 0 0 18px; }
      .app-alerts h2 { margin: 0 0 12px; }
      .app-alerts-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 12px; }
      .app-alert-group { min-width: 0; }
      .app-alert-group h3 { margin: 0 0 8px; color: var(--muted,#8da0c0); font-size: .95rem; }
      .app-alert-item { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 10px 12px; background: #111a30; border: 1px solid var(--line,#31415d); border-radius: 12px; }
      .app-alert-item + .app-alert-item { margin-top: 8px; }
      .app-alert-item p { margin: 4px 0 0; color: var(--muted,#8da0c0); font-size: .88rem; }
      .app-alert-badge { flex: 0 0 auto; padding: 4px 8px; border-radius: 999px; background: rgba(248,113,113,.16); color: #f87171; font-size: .78rem; font-weight: 700; }
      .app-alert-badge.soon { background: rgba(245,158,11,.16); color: #fbbf24; }
      .app-alert-empty, .app-alert-error { color: var(--muted,#8da0c0); margin: 0; }
      .app-alert-error { color: #f87171; }
      .app-alert-link { color: inherit; text-decoration: none; }
      .app-alert-link:hover, .app-alert-link:focus { text-decoration: underline; }
    `;
    document.head.appendChild(style);
  }

  function createPanel() {
    const panel = document.createElement('section');
    panel.className = 'card app-alerts';
    panel.id = 'appAlertsPanel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = '<h2>Alertes</h2><div class="app-alerts-grid"></div>';

    if (isDashboard) {
      const main = document.querySelector('main');
      const anchor = main?.querySelector('.dashboard-lower');
      if (main) main.insertBefore(panel, anchor || null);
    } else if (isStockPage) {
      const heading = document.querySelector('main h2');
      if (heading?.parentElement) heading.insertAdjacentElement('afterend', panel);
    } else {
      const list = document.getElementById('installationList');
      if (list) list.insertAdjacentElement('beforebegin', panel);
    }
    return panel;
  }

  function panelReady() {
    installStyles();
    return document.getElementById('appAlertsPanel') || createPanel();
  }

  function group(panel, title, id) {
    const section = document.createElement('section');
    section.className = 'app-alert-group';
    section.innerHTML = `<h3>${escapeHtml(title)}</h3><div id="${id}"><p class="app-alert-empty">Chargement…</p></div>`;
    panel.querySelector('.app-alerts-grid').appendChild(section);
    return section.querySelector(`#${id}`);
  }

  function setMessage(target, message, isError = false) {
    target.innerHTML = `<p class="${isError ? 'app-alert-error' : 'app-alert-empty'}">${escapeHtml(message)}</p>`;
  }

  async function loadStockAlerts(target) {
    const { data, error } = await db().from('articles').select('id,nom,quantite,seuil_min').order('nom');
    if (error) {
      setMessage(target, 'Impossible de charger les alertes de stock. Vérifiez vos droits ou la connexion.', true);
      if (isDashboard) setCounter('-', 0);
      console.error('Chargement des alertes de stock impossible :', error.message);
      return;
    }

    const alerts = (data || []).filter((article) => {
      const quantity = Number(article.quantite ?? 0);
      const threshold = Number(article.seuil_min ?? 0);
      return Number.isFinite(quantity) && Number.isFinite(threshold) && quantity <= threshold;
    });
    if (isDashboard) setCounter(String(alerts.length), alerts.length);
    if (!alerts.length) {
      setMessage(target, 'Aucun article au-dessous de son seuil minimal.');
      return;
    }

    target.innerHTML = alerts.map((article) => {
      const quantity = Number(article.quantite ?? 0);
      const threshold = Number(article.seuil_min ?? 0);
      return `<a class="app-alert-link" href="stock.html"><div class="app-alert-item"><div><strong>${escapeHtml(article.nom || 'Article')}</strong><p>Quantité : ${escapeHtml(quantity)} · Seuil minimal : ${escapeHtml(threshold)}</p></div><span class="app-alert-badge">Stock bas</span></div></a>`;
    }).join('');
  }

  function setCounter(value, count) {
    const counter = document.getElementById('stockAlertCount');
    if (counter) counter.textContent = value;
    const card = counter?.closest('a');
    if (card && count > 0) card.setAttribute('aria-label', `${count} alerte(s) de stock`);
  }

  async function loadMaintenanceAlerts(target) {
    const { data: plans, error } = await db().from('maintenance_systematique')
      .select('id,installation_id,type_maintenance,periodicite,date_prochaine_intervention,responsable_planification,description')
      .order('date_prochaine_intervention', { ascending: true });
    if (error) {
      setMessage(target, 'Impossible de charger les échéances de maintenance. Vérifiez vos droits ou la connexion.', true);
      console.error('Chargement des alertes de maintenance impossible :', error.message);
      return;
    }

    const currentDate = today();
    const cutoff = new Date(`${currentDate}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() + 30);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    const duePlans = (plans || []).filter((plan) => {
      const due = plan.date_prochaine_intervention;
      return Boolean(due) && due <= cutoffDate;
    });

    if (!duePlans.length) {
      setMessage(target, 'Aucune maintenance échue ou prévue dans les 30 prochains jours.');
      return;
    }

    const installationIds = [...new Set(duePlans.map((plan) => plan.installation_id).filter(Boolean))];
    let installationsById = new Map();
    if (installationIds.length) {
      const { data: rows, error: installationError } = await db().from('installations')
        .select('id,code,nom').in('id', installationIds);
      if (installationError) {
        console.warn('Noms des installations non disponibles pour les alertes :', installationError.message);
      } else {
        installationsById = new Map((rows || []).map((installation) => [String(installation.id), installation]));
      }
    }

    target.innerHTML = duePlans.map((plan) => {
      const installation = installationsById.get(String(plan.installation_id));
      const due = plan.date_prochaine_intervention;
      const overdue = due < currentDate;
      const label = overdue ? 'En retard' : due === currentDate ? "Aujourd'hui" : 'À venir';
      const className = overdue || due === currentDate ? '' : ' soon';
      const equipment = installation
        ? `${installation.code ? `${escapeHtml(installation.code)} — ` : ''}${escapeHtml(installation.nom || 'Installation')}`
        : 'Installation';
      return `<a class="app-alert-link" href="installations.html"><div class="app-alert-item"><div><strong>${equipment}</strong><p>${escapeHtml(plan.type_maintenance || 'Maintenance')} · Échéance : ${dateLabel(due)}${plan.responsable_planification ? ` · Responsable : ${escapeHtml(plan.responsable_planification)}` : ''}</p></div><span class="app-alert-badge${className}">${label}</span></div></a>`;
    }).join('');
  }

  async function refreshAlerts() {
    if (!db()) return;
    const panel = panelReady();
    const stockTarget = (isDashboard || isStockPage) ? group(panel, 'Stock à réapprovisionner', 'stockAlertsList') : null;
    const maintenanceTarget = (isDashboard || isInstallationsPage) ? group(panel, 'Maintenances à prévoir', 'maintenanceAlertsList') : null;
    const tasks = [];
    if (stockTarget) tasks.push(loadStockAlerts(stockTarget));
    if (maintenanceTarget) tasks.push(loadMaintenanceAlerts(maintenanceTarget));
    await Promise.allSettled(tasks);
  }

  function init() {
    if (!db()) {
      const panel = panelReady();
      setMessage(panel.querySelector('.app-alerts-grid'), 'Service de données indisponible. Rechargez la page après connexion.', true);
      return;
    }
    refreshAlerts();
    window.setInterval(refreshAlerts, 5 * 60 * 1000);
    document.addEventListener('submit', (event) => {
      if (['articleForm', 'installationForm', 'maintenanceEditorForm'].includes(event.target?.id)) {
        window.setTimeout(refreshAlerts, 1200);
      }
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshAlerts();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
