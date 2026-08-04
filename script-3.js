let currentUser = null;
let currentProfile = null;
let selectedPriority = 'Basse';
let requests = [];
let technicians = [];
let notesByRequest = {};
let selectedRequestId = null;

function sb() {
  return window.supabaseClient;
}

function page() {
  const path = location.pathname.split('/').pop() || 'index.html';
  if (path === 'dashboard.html') return 'dashboard';
  if (path === 'new-request.html') return 'new-request';
  if (path === 'requests.html') return 'requests';
  return 'login';
}

function badgeClass(status) {
  return ({
    'NOUVEAU': 'b-nouveau',
    'EN COURS': 'b-cours',
    'EN ATTENTE': 'b-attente',
    'TERMINE': 'b-termine',
    'ANNULE': 'b-annule'
  })[status] || 'b-attente';
}

function roleName(r) {
  return ({
    admin: 'Administrateur',
    technicien: 'Technicien',
    demandeur: 'Demandeur'
  })[r] || 'Utilisateur';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function canEditRequest() {
  return ['admin', 'technicien'].includes(currentProfile?.role);
}

async function ensureAuth() {
  if (!sb()?.auth) return true;
  const { data } = await sb().auth.getSession();
  currentUser = data.session?.user || null;
  if (!currentUser && page() !== 'login') {
    location.href = 'index.html';
    return false;
  }
  return true;
}

async function loadProfile(userId) {
  if (!sb()?.from || !userId) return;
  const { data, error } = await sb().from('profiles').select('*').eq('id', userId).single();
  if (!error) currentProfile = data;
}

async function loadTechnicians() {
  if (!sb()?.from) return;
  const allSelects = document.querySelectorAll('[data-technicien-select]');
  const { data, error } = await sb().from('techniciens').select('*').eq('actif', true).order('nom', { ascending: true });
  technicians = error ? [] : (data || []);
  allSelects.forEach(sel => {
    const currentValue = sel.dataset.selected || '';
    sel.innerHTML = '<option value="">Aucun</option>' + technicians.map(t =>
      `<option value="${t.id}" ${String(currentValue) === String(t.id) ? 'selected' : ''}>${escapeHtml(t.nom)}</option>`
    ).join('');
  });
}

async function loadRequests() {
  const list = document.getElementById('requestList');
  if (!list || !sb()?.from) return;
  const { data, error } = await sb()
    .from('interventions')
    .select('*, techniciens(id, nom)')
    .order('created_at', { ascending: false });

  if (error) {
    alert('Erreur chargement interventions : ' + error.message);
    return;
  }

  requests = (data || []).map(row => ({
    id: row.id,
    code: row.code,
    name: row.demandeur,
    department: row.departement,
    site: row.site,
    equipment: row.equipement,
    material: row.materiel,
    priority: row.priorite,
    description: row.description,
    status: row.etat,
    technicienId: row.technicien_id,
    technicienNom: row.techniciens?.nom || '',
    createdAt: row.created_at ? new Date(row.created_at).toLocaleString('fr-FR') : ''
  }));

  renderDashboard();
  renderRequests();
}

function renderDashboard() {
  const openCount = document.getElementById('openCount');
  const doneCount = document.getElementById('doneCount');
  const userRoleText = document.getElementById('userRoleText');
  const statsText = document.getElementById('statsText');
  const total = requests.length;
  const nouveau = requests.filter(r => r.status === 'NOUVEAU').length;
  const cours = requests.filter(r => r.status === 'EN COURS').length;
  const done = requests.filter(r => r.status === 'TERMINE').length;
  const open = requests.filter(r => ['NOUVEAU', 'EN COURS', 'EN ATTENTE'].includes(r.status)).length;

  if (openCount) openCount.textContent = open;
  if (doneCount) doneCount.textContent = done;
  if (userRoleText) userRoleText.textContent = roleName(currentProfile?.role);
  if (statsText) statsText.textContent = `${total} total · ${nouveau} nouveau · ${cours} en cours`;
}

function renderRequests() {
  const list = document.getElementById('requestList');
  if (!list) return;

  const q = document.getElementById('searchInput')?.value?.toLowerCase() || '';
  const status = document.getElementById('statusFilter')?.value || '';
  const priority = document.getElementById('priorityFilter')?.value || '';

  const filtered = requests.filter(r =>
    (!q || [r.code, r.name, r.department, r.site, r.equipment, r.material, r.description, r.technicienNom].join(' ').toLowerCase().includes(q)) &&
    (!status || r.status === status) &&
    (!priority || r.priority === priority)
  );

  if (!filtered.length) {
    list.innerHTML = '<div class="empty">Aucune demande trouvée.</div>';
    return;
  }

  list.innerHTML = filtered.map(r => `
    <article class="card">
      <div class="card-head">
        <div>
          <div class="title">${escapeHtml(r.code || '')} — ${escapeHtml(r.equipment || '')}</div>
          <div class="meta">
            <span>Demandeur : ${escapeHtml(r.name || '-')}</span>
            <span>Site : ${escapeHtml(r.site || '-')}</span>
            <span>Technicien : ${escapeHtml(r.technicienNom || 'Aucun')}</span>
            <span>Créé : ${escapeHtml(r.createdAt || '-')}</span>
          </div>
        </div>
        <div class="badges">
          <span class="badge ${badgeClass(r.status)}">${escapeHtml(r.status || '-')}</span>
          <span class="badge priority">${escapeHtml(r.priority || '-')}</span>
        </div>
      </div>
      <div>${escapeHtml(r.description || '')}</div>
      <div class="actions">
        <button class="btn-secondary" onclick="openRequestDetails('${String(r.id).replace(/'/g, "\\'")}')">Voir / modifier</button>
      </div>
    </article>
  `).join('');
}

async function loadNotes(requestId) {
  if (!sb()?.from || !requestId) return [];

  const queries = [
    sb().from('intervention_notes').select('*').eq('intervention_id', requestId).order('created_at', { ascending: false }),
    sb().from('notes').select('*').eq('intervention_id', requestId).order('created_at', { ascending: false })
  ];

  for (const promise of queries) {
    try {
      const { data, error } = await promise;
      if (!error && Array.isArray(data)) return data;
    } catch (_) {}
  }
  return [];
}

function renderNotesHtml(notes) {
  if (!notes?.length) return '<div class="empty">Aucune note pour cette intervention.</div>';
  return `<div class="notes-list">${notes.map(n => `
    <div class="note-item">
      <div class="note-meta">${escapeHtml(n.auteur || n.author || n.created_by || 'Utilisateur')} · ${escapeHtml(n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : '')}</div>
      <div>${escapeHtml(n.note || n.contenu || n.content || '')}</div>
    </div>
  `).join('')}</div>`;
}

function openModal() {
  const modal = document.getElementById('detailsModal');
  if (!modal) return;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const modal = document.getElementById('detailsModal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

async function openRequestDetails(requestId) {
  selectedRequestId = requestId;
  const r = requests.find(x => String(x.id) === String(requestId));
  if (!r) return;

  const modalTitle = document.getElementById('modalTitle');
  const modalSubtitle = document.getElementById('modalSubtitle');
  const modalBody = document.getElementById('modalBody');
  if (!modalBody) return;

  modalTitle.textContent = `${r.code || ''} — ${r.equipment || ''}`;
  modalSubtitle.textContent = `Demandeur : ${r.name || '-'} · Rôle : ${roleName(currentProfile?.role)} · Créé : ${r.createdAt || '-'}`;

  const notes = await loadNotes(requestId);
  notesByRequest[requestId] = notes;

  modalBody.innerHTML = `
    <div class="section">
      <h3>Informations</h3>
      <div class="grid-2">
        <div><strong>Département :</strong> ${escapeHtml(r.department || '-')}</div>
        <div><strong>Site :</strong> ${escapeHtml(r.site || '-')}</div>
        <div><strong>Équipement :</strong> ${escapeHtml(r.equipment || '-')}</div>
        <div><strong>Matériel :</strong> ${escapeHtml(r.material || '-')}</div>
        <div><strong>Technicien actuel :</strong> ${escapeHtml(r.technicienNom || 'Aucun')}</div>
        <div><strong>Priorité :</strong> ${escapeHtml(r.priority || '-')}</div>
      </div>
      <div style="margin-top:12px;"><strong>Description :</strong><br>${escapeHtml(r.description || '-')}</div>
    </div>

    <div class="section">
      <h3>Mise à jour</h3>
      <div class="grid-2">
        <div class="field">
          <label for="detailStatus">Statut</label>
          <select id="detailStatus" ${canEditRequest() ? '' : 'disabled'}>
            <option value="NOUVEAU" ${r.status === 'NOUVEAU' ? 'selected' : ''}>Nouveau</option>
            <option value="EN COURS" ${r.status === 'EN COURS' ? 'selected' : ''}>En cours</option>
            <option value="EN ATTENTE" ${r.status === 'EN ATTENTE' ? 'selected' : ''}>En attente</option>
            <option value="TERMINE" ${r.status === 'TERMINE' ? 'selected' : ''}>Terminé</option>
            <option value="ANNULE" ${r.status === 'ANNULE' ? 'selected' : ''}>Annulé</option>
          </select>
        </div>
        <div class="field">
          <label for="detailTechnicien">Technicien</label>
          <select id="detailTechnicien" data-technicien-select data-selected="${escapeHtml(r.technicienId || '')}" ${canEditRequest() ? '' : 'disabled'}>
            <option value="">Chargement...</option>
          </select>
        </div>
      </div>
      <div class="actions">
        <button class="btn-primary" id="saveRequestBtn" ${canEditRequest() ? '' : 'disabled'}>Enregistrer les modifications</button>
      </div>
    </div>

    <div class="section">
      <h3>Ajouter une note</h3>
      <div class="field">
        <label for="newNoteText">Note</label>
        <textarea id="newNoteText" rows="4" placeholder="Écrire une note de suivi..." ${canEditRequest() ? '' : 'disabled'}></textarea>
      </div>
      <div class="actions">
        <button class="btn-primary" id="addNoteBtn" ${canEditRequest() ? '' : 'disabled'}>Ajouter la note</button>
      </div>
    </div>

    <div class="section">
      <h3>Historique des notes</h3>
      <div id="notesContainer">${renderNotesHtml(notes)}</div>
    </div>
  `;

  await loadTechnicians();

  document.getElementById('saveRequestBtn')?.addEventListener('click', async () => {
    await saveRequestChanges(requestId);
  });

  document.getElementById('addNoteBtn')?.addEventListener('click', async () => {
    await addRequestNote(requestId);
  });

  openModal();
}

async function saveRequestChanges(requestId) {
  if (!canEditRequest()) return;
  const status = document.getElementById('detailStatus')?.value || null;
  const technicienId = document.getElementById('detailTechnicien')?.value || null;
  if (!sb()?.from) return;

  const { error } = await sb()
    .from('interventions')
    .update({ etat: status, technicien_id: technicienId || null })
    .eq('id', requestId);

  if (error) {
    alert('Erreur mise à jour : ' + error.message);
    return;
  }

  const item = requests.find(x => String(x.id) === String(requestId));
  if (item) {
    item.status = status;
    item.technicienId = technicienId || null;
    item.technicienNom = technicians.find(t => String(t.id) === String(technicienId))?.nom || '';
  }

  renderDashboard();
  renderRequests();
  await openRequestDetails(requestId);
}

async function addRequestNote(requestId) {
  if (!canEditRequest()) return;
  const textarea = document.getElementById('newNoteText');
  const text = textarea?.value?.trim();
  if (!text) {
    alert('Veuillez saisir une note.');
    return;
  }
  if (!sb()?.from) return;

  const payloads = [
    {
      table: 'intervention_notes',
      data: {
        intervention_id: requestId,
        note: text,
        auteur: currentUser?.email || currentProfile?.email || 'Utilisateur'
      }
    },
    {
      table: 'notes',
      data: {
        intervention_id: requestId,
        contenu: text,
        auteur: currentUser?.email || currentProfile?.email || 'Utilisateur'
      }
    }
  ];

  let saved = false;
  let lastError = null;

  for (const entry of payloads) {
    try {
      const { error } = await sb().from(entry.table).insert(entry.data);
      if (!error) {
        saved = true;
        break;
      }
      lastError = error;
    } catch (err) {
      lastError = err;
    }
  }

  if (!saved) {
    alert('Erreur ajout note : ' + (lastError?.message || 'table de notes introuvable'));
    return;
  }

  textarea.value = '';
  const notes = await loadNotes(requestId);
  notesByRequest[requestId] = notes;
  const notesContainer = document.getElementById('notesContainer');
  if (notesContainer) notesContainer.innerHTML = renderNotesHtml(notes);
}

function bindRequestsPageEvents() {
  document.getElementById('searchInput')?.addEventListener('input', renderRequests);
  document.getElementById('statusFilter')?.addEventListener('change', renderRequests);
  document.getElementById('priorityFilter')?.addEventListener('change', renderRequests);
  document.getElementById('refreshBtn')?.addEventListener('click', async () => {
    await loadRequests();
  });
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  document.getElementById('detailsModal')?.addEventListener('click', e => {
    if (e.target.id === 'detailsModal') closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

async function initRequestsPage() {
  bindRequestsPageEvents();
  await ensureAuth();
  if (currentUser?.id) await loadProfile(currentUser.id);
  await loadTechnicians();
  await loadRequests();
}

async function initDashboardPage() {
  await ensureAuth();
  if (currentUser?.id) await loadProfile(currentUser.id);
  await loadRequests();
}

document.addEventListener('DOMContentLoaded', async () => {
  const p = page();
  if (p === 'requests') await initRequestsPage();
  else if (p === 'dashboard') await initDashboardPage();
});

window.openRequestDetails = openRequestDetails;
window.closeModal = closeModal;

