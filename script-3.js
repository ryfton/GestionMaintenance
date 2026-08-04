let currentUser = null;
let currentProfile = null;
let selectedPriority = 'Basse';
let requests = [];
let technicians = [];

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

async function ensureAuth() {
  const { data } = await sb().auth.getSession();
  currentUser = data.session?.user || null;
  if (!currentUser && page() !== 'login') location.href = 'index.html';
  return !!currentUser;
}

function showLoginState() {
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  const roleLabel = document.getElementById('roleLabel');
  if (loginScreen) loginScreen.classList.add('active');
  if (appScreen) appScreen.classList.remove('active');
  if (roleLabel) roleLabel.textContent = 'ACCUEIL';
}

function showAppState() {
  const loginScreen = document.getElementById('loginScreen');
  const appScreen = document.getElementById('appScreen');
  const roleLabel = document.getElementById('roleLabel');
  if (loginScreen) loginScreen.classList.remove('active');
  if (appScreen) appScreen.classList.add('active');
  if (roleLabel) roleLabel.textContent = `Connecté : ${currentUser?.email || ''}`;
}

async function loadProfile(userId) {
  const { data, error } = await sb().from('profiles').select('*').eq('id', userId).single();
  if (!error) currentProfile = data;
}

async function loadTechnicians() {
  const sel = document.getElementById('technicienSelect');
  const { data, error } = await sb().from('techniciens').select('*').eq('actif', true).order('nom', { ascending: true });
  technicians = error ? [] : (data || []);
  if (sel) {
    sel.innerHTML = '<option value="">Aucun</option>' + technicians.map(t => `<option value="${t.id}">${t.nom}</option>`).join('');
  }
}

async function loadRequests() {
  const list = document.getElementById('requestList');
  if (!list) return;

  const { data, error } = await sb().from('interventions').select('*, techniciens(id, nom)').order('created_at', { ascending: false });
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
    createdAt: new Date(row.created_at).toLocaleString('fr-FR')
  }));

  renderDashboard();
  renderRequests();
}

function renderDashboard() {
  const openCount = document.getElementById('openCount');
  const doneCount = document.getElementById('doneCount');
  const userRoleText = document.getElementById('userRoleText');
  const statsText = document.getElementById('statsText');
  if (!statsText) return;

  const total = requests.length;
  const nouveau = requests.filter(r => r.status === 'NOUVEAU').length;
  const cours = requests.filter(r => r.status === 'EN COURS').length;
  const done = requests.filter(r => r.status === 'TERMINE').length;
  const open = requests.filter(r => ['NOUVEAU', 'EN COURS', 'EN ATTENTE'].includes(r.status)).length;

  if (openCount) openCount.textContent = open;
  if (doneCount) doneCount.textContent = done;
  if (userRoleText) userRoleText.textContent = roleName(currentProfile?.role);
  statsText.textContent = `${total} total · ${nouveau} nouveau · ${cours} en cours`;
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

  list.innerHTML = filtered.map(r => `
    <div class="request-card" data-id="${r.id}">
      <div>
        <strong>${r.code || ''} — ${r.equipment || ''}</strong>
        <p class="meta">${r.name || ''} · ${r.department || ''} · ${r.site || ''}</p>
        <p class="meta">Technicien : ${r.technicienNom || 'Aucun'} · Créé : ${r.createdAt}</p>
        <p style="margin-top:8px;">${r.description || ''}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;min-width:140px;">
        <span class="badge ${badgeClass(r.status)}">${r.status || ''}</span>
        <span class="badge">${r.priority || ''}</span>
      </div>
    </div>
  `).join('') || '<div class="card">Aucune intervention trouvée.</div>';

  list.querySelectorAll('.request-card').forEach(card => {
    card.addEventListener('click', () => openRequestDetails(card.dataset.id));
  });
}

function renderTechnicianOptionsForModal(selected = '') {
  return '<option value="">Aucun</option>' + technicians.map(t =>
    `<option value="${t.id}" ${String(t.id) === String(selected) ? 'selected' : ''}>${t.nom}</option>`
  ).join('');
}

async function loadNotes(requestId) {
  const tests = ['intervention_notes', 'notes_intervention', 'notes'];
  for (const table of tests) {
    const { data, error } = await sb().from(table).select('*').eq('intervention_id', requestId).order('created_at', { ascending: false });
    if (!error) return data || [];
  }
  return [];
}

function renderNotes(notes) {
  if (!notes.length) return '<p class="meta">Aucune note.</p>';
  return notes.map(n => `
    <div class="detail-box" style="margin-top:10px;">
      <small>${n.auteur || n.author || 'Utilisateur'} · ${n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : ''}</small>
      <p style="margin-top:6px;">${n.note || n.contenu || n.content || ''}</p>
    </div>
  `).join('');
}

async function openRequestDetails(id) {
  const modal = document.getElementById('detailsModal');
  const modalBody = document.getElementById('modalBody');
  const r = requests.find(x => String(x.id) === String(id));
  if (!modal || !modalBody || !r) return;

  const notes = await loadNotes(id);

  modalBody.innerHTML = `
    <h2>${r.code || ''} — ${r.equipment || ''}</h2>
    <p class="meta">${r.description || ''}</p>

    <div class="detail-grid">
      <div class="detail-box"><strong>Demandeur</strong><p>${r.name || '-'}</p></div>
      <div class="detail-box"><strong>Département</strong><p>${r.department || '-'}</p></div>
      <div class="detail-box"><strong>Site</strong><p>${r.site || '-'}</p></div>
      <div class="detail-box"><strong>Matériel</strong><p>${r.material || '-'}</p></div>
      <div class="detail-box"><strong>Priorité</strong><p>${r.priority || '-'}</p></div>
      <div class="detail-box"><strong>Créé le</strong><p>${r.createdAt || '-'}</p></div>
    </div>

    <div class="detail-grid">
      <div class="field">
        <label for="modalTechnicienSelect">Technicien</label>
        <select id="modalTechnicienSelect">${renderTechnicianOptionsForModal(r.technicienId)}</select>
      </div>
      <div class="field">
        <label for="modalStatusSelect">Statut</label>
        <select id="modalStatusSelect">
          <option value="NOUVEAU" ${r.status === 'NOUVEAU' ? 'selected' : ''}>Nouveau</option>
          <option value="EN COURS" ${r.status === 'EN COURS' ? 'selected' : ''}>En cours</option>
          <option value="EN ATTENTE" ${r.status === 'EN ATTENTE' ? 'selected' : ''}>En attente</option>
          <option value="TERMINE" ${r.status === 'TERMINE' ? 'selected' : ''}>Terminé</option>
          <option value="ANNULE" ${r.status === 'ANNULE' ? 'selected' : ''}>Annulé</option>
        </select>
      </div>
    </div>

    <div class="action-row">
      <button class="primary" id="saveDetailsBtn">Enregistrer</button>
    </div>

    <h3 style="margin-top:18px;">Ajouter une note</h3>
    <textarea id="noteInput" class="note-box" placeholder="Écrire une note..."></textarea>
    <div class="action-row">
      <button class="secondary" id="addNoteBtn">Ajouter la note</button>
    </div>

    <h3 style="margin-top:18px;">Historique des notes</h3>
    <div id="notesList">${renderNotes(notes)}</div>
  `;

  document.getElementById('saveDetailsBtn')?.addEventListener('click', () => saveRequestDetails(id));
  document.getElementById('addNoteBtn')?.addEventListener('click', () => addRequestNote(id));

  if (typeof modal.showModal === 'function') modal.showModal();
}

async function saveRequestDetails(id) {
  const status = document.getElementById('modalStatusSelect')?.value || null;
  const technicienId = document.getElementById('modalTechnicienSelect')?.value || null;

  const { error } = await sb().from('interventions').update({
    etat: status,
    technicien_id: technicienId || null
  }).eq('id', id);

  if (error) {
    alert('Erreur modification : ' + error.message);
    return;
  }

  await loadRequests();
  await openRequestDetails(id);
}

async function addRequestNote(id) {
  const note = document.getElementById('noteInput')?.value.trim();
  if (!note) {
    alert('Veuillez saisir une note');
    return;
  }

  let result = await sb().from('intervention_notes').insert({
    intervention_id: id,
    note,
    auteur: currentUser?.email || 'Utilisateur'
  });

  if (result.error) {
    result = await sb().from('notes_intervention').insert({
      intervention_id: id,
      note,
      auteur: currentUser?.email || 'Utilisateur'
    });
  }

  if (result.error) {
    result = await sb().from('notes').insert({
      intervention_id: id,
      contenu: note,
      auteur: currentUser?.email || 'Utilisateur'
    });
  }

  if (result.error) {
    alert('Erreur ajout note : ' + result.error.message);
    return;
  }

  await openRequestDetails(id);
}

function bindRequestsPage() {
  document.getElementById('searchInput')?.addEventListener('input', renderRequests);
  document.getElementById('statusFilter')?.addEventListener('change', renderRequests);
  document.getElementById('priorityFilter')?.addEventListener('change', renderRequests);
  document.getElementById('closeModalBtn')?.addEventListener('click', () => {
    document.getElementById('detailsModal')?.close();
  });
}

async function initRequestsPage() {
  bindRequestsPage();
  await ensureAuth();
  if (currentUser?.id) await loadProfile(currentUser.id);
  await loadTechnicians();
  await loadRequests();
}

document.addEventListener('DOMContentLoaded', async () => {
  if (page() === 'requests') {
    await initRequestsPage();
  }
});
