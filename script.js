let currentUser = null;
let currentProfile = null;
let selectedPriority = 'Basse';
let requests = [];
let technicians = [];

const loginScreen = document.getElementById('loginScreen');
const appScreen = document.getElementById('appScreen');
const roleLabel = document.getElementById('roleLabel');
const statsText = document.getElementById('statsText');
const requestList = document.getElementById('requestList');
const modal = document.getElementById('detailsModal');
const modalBody = document.getElementById('modalBody');
const userRoleText = document.getElementById('userRoleText');
const openCount = document.getElementById('openCount');
const doneCount = document.getElementById('doneCount');
const technicienSelect = document.getElementById('technicienSelect');

function sb() {
  return window.supabaseClient;
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

function showScreen(name) {
  loginScreen.classList.toggle('active', name === 'login');
  appScreen.classList.toggle('active', name === 'app');
  roleLabel.textContent = name === 'app' ? `Connecté : ${currentUser?.email || ''}` : 'ACCUEIL';
  document.getElementById('logoutBtn').classList.toggle('hidden', name !== 'app');
}

function renderTechniciansOptions(selected = '') {
  technicienSelect.innerHTML =
    '<option value="">Aucun</option>' +
    technicians.map(t => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${t.nom}</option>`).join('');
}

function render() {
  const total = requests.length;
  const nouveau = requests.filter(r => r.status === 'NOUVEAU').length;
  const cours = requests.filter(r => r.status === 'EN COURS').length;
  const done = requests.filter(r => r.status === 'TERMINE').length;
  const open = requests.filter(r => ['NOUVEAU', 'EN COURS', 'EN ATTENTE'].includes(r.status)).length;

  statsText.textContent = `${total} total · ${nouveau} nouveau · ${cours} en cours`;
  openCount.textContent = open;
  doneCount.textContent = done;
  userRoleText.textContent = roleName(currentProfile?.role);

  const q = document.getElementById('searchInput').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const priority = document.getElementById('priorityFilter').value;

  const filtered = requests.filter(r =>
    (!q || [r.code, r.name, r.department, r.site, r.equipment, r.material, r.description, r.technicienNom].join(' ').toLowerCase().includes(q)) &&
    (!status || r.status === status) &&
    (!priority || r.priority === priority)
  );

  requestList.innerHTML = filtered.map(r => `
    <article class="request-card" data-id="${r.id}">
      <div>
        <div class="badge ${badgeClass(r.status)}">${r.status}</div>
        <h3 style="margin:10px 0 4px">${r.code} — ${r.equipment}</h3>
        <p>${r.description}</p>
        <div class="meta">${r.name} · ${r.department} · ${r.site} · ${r.technicienNom || 'Non assigné'}</div>
      </div>
      <div style="text-align:right">
        <div class="badge ${r.priority === 'Urgente' ? 'b-annule' : r.priority === 'Haute' ? 'b-cours' : 'b-nouveau'}">${r.priority}</div>
        <div class="meta" style="margin-top:10px">${r.createdAt}</div>
      </div>
    </article>
  `).join('') || '<p class="meta">Aucune intervention trouvée.</p>';
}

async function loadTechnicians() {
  const { data, error } = await sb().from('techniciens').select('*').eq('actif', true).order('nom', { ascending: true });
  technicians = error ? [] : (data || []);
  renderTechniciansOptions();
}

async function loadProfile(userId) {
  const { data, error } = await sb().from('profiles').select('*').eq('id', userId).single();
  if (!error) currentProfile = data;
}

async function loadRequests() {
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
    createdAt: new Date(row.created_at).toLocaleString('fr-FR')
  }));

  render();
}

async function refreshAll() {
  await Promise.all([loadTechnicians(), loadRequests()]);
}

async function login() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) return alert('Connexion refusée : ' + error.message);

  currentUser = data.user;
  await loadProfile(currentUser.id);
  showScreen('app');
  await refreshAll();
}
//test commit
async function logout() {
  await sb().auth.signOut();
  currentUser = null;
  currentProfile = null;
  technicians = [];
  requests = [];
  showScreen('login');
}

async function loadHistory(id) {
  const box = document.getElementById('historyBox');
  if (!box) return;

  const { data: history, error: hError } = await sb()
    .from('historique_interventions')
    .select('*')
    .eq('intervention_id', id)
    .order('created_at', { ascending: false });

  const { data: notes, error: nError } = await sb()
    .from('notes_interventions')
    .select('*')
    .eq('intervention_id', id)
    .order('created_at', { ascending: false });

  if (hError || nError) {
    box.innerHTML = '<p class="meta">Erreur de chargement de l’historique.</p>';
    return;
  }

  const h = (history || []).map(x => `
    <div class="detail-box" style="margin-bottom:8px">
      <small>${new Date(x.created_at).toLocaleString('fr-FR')}</small>
      <div>${x.ancien_etat || '-'} → ${x.nouvel_etat || '-'}</div>
      <div>${x.note || ''}</div>
    </div>
  `).join('');

  const n = (notes || []).map(x => `
    <div class="detail-box" style="margin-bottom:8px">
      <small>${new Date(x.created_at).toLocaleString('fr-FR')}</small>
      <div>${x.note}</div>
      <div class="meta">${x.created_by || ''}</div>
    </div>
  `).join('');

  box.innerHTML = h + n || '<p class="meta">Aucun historique.</p>';
}

async function loadTechSelectInModal(selected = '') {
  const wrap = document.getElementById('techSelectWrap');
  if (!wrap) return;
  const options = technicians.map(t => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${t.nom}</option>`).join('');
  wrap.innerHTML = `<select id="techSelectModal"><option value="">Aucun</option>${options}</select>`;
}

function openDetails(id) {
  const r = requests.find(x => x.id === id);
  if (!r) return;

  modalBody.innerHTML = `
    <div class="badge ${badgeClass(r.status)}">${r.status}</div>
    <h2 style="margin-top:10px">${r.code} — ${r.equipment}</h2>
    <div class="detail-grid">
      <div class="detail-box"><strong>Demandeur</strong><div>${r.name}</div></div>
      <div class="detail-box"><strong>Département</strong><div>${r.department}</div></div>
      <div class="detail-box"><strong>Site</strong><div>${r.site}</div></div>
      <div class="detail-box"><strong>Priorité</strong><div>${r.priority}</div></div>
      <div class="detail-box"><strong>Technicien</strong><div>${r.technicienNom || 'Aucun'}</div></div>
      <div class="detail-box"><strong>Matériel</strong><div>${r.material || 'Aucun renseigné'}</div></div>
      <div class="detail-box" style="grid-column:1/-1"><strong>Description</strong><div style="margin-top:6px">${r.description}</div></div>
    </div>

    <div class="action-row">
      <button class="status-btn" data-action="take">Prendre en charge</button>
      <button class="status-btn" data-status="NOUVEAU">Nouveau</button>
      <button class="status-btn" data-status="EN COURS">En cours</button>
      <button class="status-btn" data-status="EN ATTENTE">En attente</button>
      <button class="status-btn" data-status="TERMINE">Terminé</button>
      <button class="status-btn" data-status="ANNULE">Annulé</button>
    </div>

    <div style="margin-top:16px">
      <label for="noteText"><strong>Ajouter une note</strong></label>
      <textarea id="noteText" class="note-box" placeholder="Ajouter un commentaire de suivi..."></textarea>
      <div class="action-row">
        <button class="small-btn" id="saveNoteBtn">Enregistrer la note</button>
      </div>
    </div>

    <div style="margin-top:16px">
      <label><strong>Assigner un technicien</strong></label>
      <div id="techSelectWrap"></div>
      <div class="action-row">
        <button class="small-btn" id="saveTechBtn">Assigner</button>
      </div>
    </div>

    <div style="margin-top:16px">
      <strong>Historique</strong>
      <div id="historyBox" style="margin-top:10px"></div>
    </div>
  `;

  modal.dataset.id = id;
  modal.showModal();
  loadHistory(id);
  loadTechSelectInModal(r.technicienId || '');
}

async function updateStatus(id, newStatus) {
  const oldRequest = requests.find(r => r.id === id);
  const oldStatus = oldRequest ? oldRequest.status : null;

  const { error } = await sb().from('interventions').update({
    etat: newStatus,
    updated_at: new Date().toISOString()
  }).eq('id', id);

  if (error) return alert('Erreur mise à jour : ' + error.message);

  await sb().from('historique_interventions').insert([{
    intervention_id: id,
    ancien_etat: oldStatus,
    nouvel_etat: newStatus,
    note: `Changement d'état`,
    changed_by: currentUser?.email || null
  }]);

  await refreshAll();
  modal.close();
}

async function takeCharge(id) {
  const tech = technicians.find(t => t.email === currentUser?.email);
  if (!tech) return alert('Aucun technicien trouvé pour cet utilisateur.');

  const { error } = await sb().from('interventions').update({
    technicien_id: tech.id,
    etat: 'EN COURS',
    updated_at: new Date().toISOString()
  }).eq('id', id);

  if (error) return alert('Erreur prise en charge : ' + error.message);

  await sb().from('historique_interventions').insert([{
    intervention_id: id,
    ancien_etat: 'NOUVEAU',
    nouvel_etat: 'EN COURS',
    note: 'Prise en charge',
    changed_by: currentUser?.email || null
  }]);

  await refreshAll();
  modal.close();
}

async function saveNote(id) {
  const noteEl = document.getElementById('noteText');
  const note = noteEl ? noteEl.value.trim() : '';
  if (!note) return;

  const { error } = await sb().from('notes_interventions').insert([{
    intervention_id: id,
    note,
    created_by: currentUser?.email || null
  }]);

  if (error) return alert('Erreur note : ' + error.message);

  if (noteEl) noteEl.value = '';
  await loadHistory(id);
  await refreshAll();
}

async function assignTech(id) {
  const select = document.getElementById('techSelectModal');
  const techId = select ? select.value || null : null;

  const { error } = await sb().from('interventions').update({
    technicien_id: techId,
    updated_at: new Date().toISOString()
  }).eq('id', id);

  if (error) return alert('Erreur assignation : ' + error.message);

  await refreshAll();
  modal.close();
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('closeModalBtn').addEventListener('click', () => modal.close());

document.getElementById('priorityGroup').addEventListener('click', e => {
  if (!e.target.matches('.chip')) return;
  selectedPriority = e.target.dataset.value;
  document.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b === e.target));
});

document.getElementById('requestForm').addEventListener('submit', async e => {
  e.preventDefault();

  const payload = {
    demandeur: document.getElementById('name').value.trim(),
    departement: document.getElementById('department').value.trim(),
    site: document.getElementById('site').value.trim(),
    equipement: document.getElementById('equipment').value.trim(),
    materiel: document.getElementById('material').value.trim(),
    priorite: selectedPriority,
    description: document.getElementById('description').value.trim(),
    etat: 'NOUVEAU',
    cree_par: currentUser?.id || null,
    technicien_id: document.getElementById('technicienSelect').value || null
  };

  const { data, error } = await sb().from('interventions').insert([payload]).select().single();
  if (error) return alert('Erreur enregistrement : ' + error.message);

  if (data) {
    await sb().from('historique_interventions').insert([{
      intervention_id: data.id,
      ancien_etat: null,
      nouvel_etat: 'NOUVEAU',
      note: 'Création de l’intervention',
      changed_by: currentUser?.email || null
    }]);
  }

  e.target.reset();
  selectedPriority = 'Basse';
  document.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b.dataset.value === 'Basse'));
  await refreshAll();
  alert('Intervention enregistrée.');
});

requestList.addEventListener('click', e => {
  const card = e.target.closest('.request-card');
  if (card) openDetails(card.dataset.id);
});

modalBody.addEventListener('click', async e => {
  const btn = e.target.closest('.status-btn');
  if (btn) {
    const id = modal.dataset.id;
    if (btn.dataset.action === 'take') return takeCharge(id);
    if (btn.dataset.status) return updateStatus(id, btn.dataset.status);
  }

  if (e.target.id === 'saveNoteBtn') return saveNote(modal.dataset.id);
  if (e.target.id === 'saveTechBtn') return assignTech(modal.dataset.id);
});

['searchInput', 'statusFilter', 'priorityFilter'].forEach(id => {
  document.getElementById(id).addEventListener('input', render);
});

sb().auth.getSession().then(async ({ data }) => {
  if (data.session) {
    currentUser = data.session.user;
    await loadProfile(currentUser.id);
    showScreen('app');
    await refreshAll();
  } else {
    showScreen('login');
  }
});
