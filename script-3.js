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
  if (path === 'archives.html') return 'archives';
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
  const { data, error } = await sb().from('profiles').select('*').eq('id', userId).maybeSingle();
  // fallback: some schemas use user_id
  if (error || !data) {
    const { data: d2, error: e2 } = await sb().from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (!e2 && d2) {
      currentProfile = d2;
      return;
    }
  }
  currentProfile = data || null;
}

async function loadTechnicians() {
  const sel = document.getElementById('technicienSelect');
  const { data, error } = await sb().from('techniciens').select('*').eq('actif', true).order('nom', { ascending: true });
  technicians = error ? [] : (data || []);
  if (sel) {
    sel.innerHTML = '<option value="">Aucun</option>' + technicians.map(t => `<option value="${t.id}">${t.nom}</option>`).join('');
  }
}

// Load active (non-archived) requests
async function loadRequests() {
  const list = document.getElementById('requestList');
  // on pages without requestList (like dashboard) still fetch to populate requests[]

  const { data, error } = await sb()
    .from('interventions')
    .select('*, techniciens(id, nom)')
    .eq('archived', false)
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
    createdAt: new Date(row.created_at).toLocaleString('fr-FR'),
    archived: !!row.archived,
    start_time: row.start_time || null,
    end_time: row.end_time || null
  }));

  renderDashboard();
  renderRequests();
}

function formatDateTime(dt) {
  if (!dt) return '-';
  try { return new Date(dt).toLocaleString('fr-FR'); } catch (e) { return dt; }
}

function durationText(start, end) {
  if (!start || !end) return '-';
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.max(0, e - s);
  const minutes = Math.round(diff / 60000);
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs ? `${hrs}h ${mins}m` : `${mins}m`;
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
        <button class="small-btn archive-btn" data-id="${r.id}" ${r.archived ? 'disabled' : (canArchive(r.status) ? '' : 'disabled')} style="margin-top:8px;">Archiver</button>
      </div>
    </div>
  `).join('') || '<div class="card">Aucune intervention trouvée.</div>';

  list.querySelectorAll('.request-card').forEach(card => {
    card.addEventListener('click', () => openRequestDetails(card.dataset.id));
  });

  // archive button handlers (stop propagation so modal doesn't open)
  list.querySelectorAll('.archive-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const r = requests.find(x => String(x.id) === String(id));
      if (!r) return alert('Intervention introuvable.');
      if (r.archived) return alert('Déjà archivée.');
      if (!canArchive(r.status)) return alert('Seules les interventions terminées ou annulées peuvent être archivées.');
      const ok = confirm('Confirmez-vous l\'archivage de cette intervention ? Cette action est irréversible.');
      if (!ok) return;
      btn.disabled = true;
      await setArchiveState(id, true);
    });
  });
}

function renderTechnicianOptionsForModal(selected = '') {
  return '<option value="">Aucun</option>' + technicians.map(t =>
    `<option value="${t.id}" ${String(t.id) === String(selected) ? 'selected' : ''}>${t.nom}</option>`
  ).join('');
}

// Normalized loadNotes: prefer notes_interventions and map fields
async function loadNotes(requestId) {
  const tests = ['notes_interventions','intervention_notes','notes_intervention','notes'];
  for (const table of tests) {
    const { data, error } = await sb().from(table).select('*').eq('intervention_id', requestId).order('created_at', { ascending: false });
    if (!error && data) {
      return (data || []).map(n => ({
        note: n.note || n.contenu || n.content || '',
        auteur: n.created_by || n.auteur || n.author || 'Utilisateur',
        created_at: n.created_at || n.createdAt || null
      }));
    }
  }
  return [];
}

function renderNotes(notes) {
  if (!notes || !notes.length) return '<p class="meta">Aucune note.</p>';
  return notes.map(n => `
    <div class="detail-box" style="margin-top:10px;">
      <small>${n.auteur || 'Utilisateur'} · ${n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : ''}</small>
      <p style="margin-top:6px;">${n.note || ''}</p>
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
      <div class="detail-box"><strong>Heure début</strong><p>${formatDateTime(r.start_time)}</p></div>
      <div class="detail-box"><strong>Heure fin</strong><p>${formatDateTime(r.end_time)}</p></div>
      <div class="detail-box"><strong>Durée</strong><p>${durationText(r.start_time, r.end_time)}</p></div>
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

    <div class="action-row" id="actionRow">
      <button class="primary" id="saveDetailsBtn">Enregistrer</button>
      <button class="ghost" id="archiveBtn">${r.archived ? 'Archivée' : 'Archiver'}</button>
    </div>

    <h3 style="margin-top:18px;">Ajouter une note</h3>
    <textarea id="noteInput" class="note-box" placeholder="Écrire une note..."></textarea>
    <div class="action-row">
      <button class="secondary" id="addNoteBtn">Ajouter la note</button>
    </div>

    <h3 style="margin-top:18px;">Historique des notes</h3>
    <div id="notesList">${renderNotes(notes)}</div>
  `;

  // If archived -> readonly: disable inputs and hide save/archive buttons
  if (r.archived) {
    document.getElementById('modalTechnicienSelect')?.setAttribute('disabled', 'disabled');
    document.getElementById('modalStatusSelect')?.setAttribute('disabled', 'disabled');
    document.getElementById('saveDetailsBtn')?.setAttribute('disabled', 'disabled');
    document.getElementById('archiveBtn')?.setAttribute('disabled', 'disabled');
    document.getElementById('addNoteBtn')?.setAttribute('disabled', 'disabled');
    // show a notice
    const ar = document.getElementById('actionRow');
    if (ar) {
      const p = document.createElement('div');
      p.className = 'meta';
      p.style.marginTop = '8px';
      p.textContent = 'Cette intervention est archivée et est en lecture seule.';
      ar.parentNode.insertBefore(p, ar.nextSibling);
    }
  }

  document.getElementById('saveDetailsBtn')?.addEventListener('click', () => saveRequestDetails(id));
  document.getElementById('addNoteBtn')?.addEventListener('click', () => addRequestNote(id));
  document.getElementById('archiveBtn')?.addEventListener('click', async () => {
    const ok = confirm('Confirmez-vous l\'archivage de cette intervention ? Cette action est irréversible.');
    if (!ok) return;
    const shouldArchive = true; // once archived cannot be undone
    await setArchiveState(id, shouldArchive);
  });

  if (typeof modal.showModal === 'function') modal.showModal();
}

async function saveRequestDetails(id) {
  const r = requests.find(x => String(x.id) === String(id));
  if (!r) return alert('Intervention introuvable.');
  if (r.archived) return alert('Cette intervention est archivée et ne peut pas être modifiée.');

  const status = document.getElementById('modalStatusSelect')?.value || null;
  const technicienId = document.getElementById('modalTechnicienSelect')?.value || null;

  // prepare payload and manage start/end times
  const payload = { etat: status, technicien_id: technicienId || null };
  const prevStatus = r.status;

  if (prevStatus !== 'EN COURS' && status === 'EN COURS') {
    payload.start_time = new Date().toISOString();
  }
  if (prevStatus === 'EN COURS' && status === 'TERMINE') {
    payload.end_time = new Date().toISOString();
  }

  const { error } = await sb().from('interventions').update(payload).eq('id', id);

  if (error) {
    alert('Erreur modification : ' + error.message);
    return;
  }

  await loadRequests();
  await openRequestDetails(id);
}

// Simplified addRequestNote: insert into notes_interventions only
async function addRequestNote(id) {
  const note = document.getElementById('noteInput')?.value.trim();
  if (!note) {
    alert('Veuillez saisir une note');
    return;
  }

  const payload = {
    intervention_id: id,
    note,
    created_by: currentUser?.email || 'Utilisateur'
  };

  const { data, error } = await sb().from('notes_interventions').insert([payload]).select().single();

  if (error) {
    alert('Erreur ajout note : ' + error.message);
    return;
  }

  document.getElementById('noteInput').value = '';
  await openRequestDetails(id);
}

// Archiving helpers
function canArchive(status) {
  return status === 'TERMINE' || status === 'ANNULE';
}

async function setArchiveState(id, archive) {
  const r = requests.find(x => String(x.id) === String(id));
  if (!r) return alert('Intervention introuvable.');
  if (archive && !canArchive(r.status)) return alert('Seules les interventions terminées ou annulées peuvent être archivées.');
  if (!archive && r.archived) return alert('Une intervention archivée ne peut pas être désarchivée.');

  const { error } = await sb().from('interventions').update({ archived: archive, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return alert('Erreur archivage : ' + error.message);
  await loadRequests();
  // if on archives page and we just unarchived (not allowed) refresh archives view
  if (page() === 'archives') await loadArchivedRequests();
  document.getElementById('detailsModal')?.close?.();
}

// Load archived requests for archives.html
async function loadArchivedRequests() {
  const list = document.getElementById('archiveList');
  if (!list) return;
  const { data, error } = await sb()
    .from('interventions')
    .select('*, techniciens(id, nom)')
    .eq('archived', true)
    .order('created_at', { ascending: false });
  if (error) { list.innerHTML = '<p class="meta">Erreur: '+error.message+'</p>'; return; }
  const items = (data || []).map(row => ({
    id: row.id,
    code: row.code,
    equipment: row.equipement,
    name: row.demandeur,
    department: row.departement,
    site: row.site,
    technicienNom: row.techniciens?.nom || '',
    status: row.etat,
    priority: row.priorite,
    createdAt: new Date(row.created_at).toLocaleString('fr-FR'),
    start_time: row.start_time || null,
    end_time: row.end_time || null
  }));

  list.innerHTML = items.map(r => `
     <div class="request-card" data-id="${r.id}">
       <div>
         <strong>${r.code || ''} — ${r.equipment || ''}</strong>
         <p class="meta">${r.name} · ${r.department}</p>
         <p class="meta">Début : ${formatDateTime(r.start_time)} · Fin : ${formatDateTime(r.end_time)} · Durée : ${durationText(r.start_time, r.end_time)}</p>
       </div>
       <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;min-width:140px;">
         <span class="badge ${badgeClass(r.status)}">${r.status}</span>
         <span class="badge">${r.priority}</span>
       </div>
     </div>
  `).join('') || '<div class="card">Aucune intervention archivée.</div>';

  list.querySelectorAll('.request-card').forEach(card => {
    card.addEventListener('click', () => openRequestDetails(card.dataset.id));
  });
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

// DOM ready: ensure dashboard loads requests as well
document.addEventListener('DOMContentLoaded', async () => {
  if (page() === 'requests') {
    await initRequestsPage();
  } else if (page() === 'dashboard') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
    await loadRequests();
  } else if (page() === 'new-request') {
    await ensureAuth();
    await loadTechnicians();
  } else if (page() === 'archives') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
    await loadArchivedRequests();
  }
});



// Ajoute la gestion du bouton "Se connecter" et la vérification de session

async function login() {
  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value.trim() || '';

  if (!email || !password) {
    return alert('Veuillez saisir email et mot de passe');
  }

  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) return alert('Connexion refusée : ' + error.message);

  currentUser = data.user;
  await loadProfile(currentUser.id);
  showAppState();

  // Par défaut, rediriger vers le tableau de bord après connexion
  if (!location.pathname.endsWith('dashboard.html')) {
    location.href = 'dashboard.html';
  }
}

// Attacher l'écouteur si le bouton existe sur la page
if (document.getElementById('loginBtn')) {
  document.getElementById('loginBtn').addEventListener('click', login);
}

// Vérifier la session existante au chargement de n'importe quelle page
sb().auth.getSession().then(async ({ data }) => {
  if (data?.session) {
    currentUser = data.session.user;
    await loadProfile(currentUser.id);
    // si on est sur la page de connexion, rediriger vers dashboard
    if (location.pathname === '/' || location.pathname.endsWith('index.html')) {
      location.href = 'dashboard.html';
    }
  } else {
    // si on est sur index.html, afficher état login
    if (location.pathname === '/' || location.pathname.endsWith('index.html')) {
      showLoginState();
    }
  }
});
