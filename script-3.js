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
  if (sel) sel.innerHTML = '<option value="">Aucun</option>' + technicians.map(t => `<option value="${t.id}">${t.nom}</option>`).join('');
}

async function loadRequests() {
  const list = document.getElementById('requestList');
  if (!list) return;
  const { data, error } = await sb().from('interventions').select('*, techniciens(id, nom)').order('created_at', { ascending: false });
  if (error) return alert('Erreur chargement interventions : ' + error.message);
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
  renderRequests();
}

function renderDashboard() {
  const openCount = document.getElementById('openCount');
  const doneCount = document.getElementById('doneCount');
  const userRoleText = document.getElementById('userRoleText');
  const statsText = document.getElementById('statsText');
  if (!openCount || !doneCount || !userRoleText || !statsText) return;
  const total = requests.length;
  const nouveau = requests.filter(r => r.status === 'NOUVEAU').length;
  const cours = requests.filter(r => r.status === 'EN COURS').length;
  const done = requests.filter(r => r.status === 'TERMINE').length;
  const open = requests.filter(r => ['NOUVEAU', 'EN COURS', 'EN ATTENTE'].includes(r.status)).length;
  openCount.textContent = open;
  doneCount.textContent = done;
  userRoleText.textContent = roleName(currentProfile?.role);
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
    <article class="request-card" data-id="${r.id}">
      <div>
        <div class="badge ${badgeClass(r.status)}">${r.status}</div>
        <h3 style="margin:10px 0 4px">${r.code || ''} — ${r.equipment || ''}</h3>
        <p>${r.description || ''}</p>
        <div class="meta">${r.name || ''} · ${r.department || ''} · ${r.site || ''} · ${r.technicienNom || 'Non assigné'}</div>
      </div>
      <div style="text-align:right">
        <div class="badge ${r.priority === 'Urgente' ? 'b-annule' : r.priority === 'Haute' ? 'b-cours' : 'b-nouveau'}">${r.priority || ''}</div>
        <div class="meta" style="margin-top:10px">${r.createdAt || ''}</div>
      </div>
    </article>
  `).join('') || '<p class="meta">Aucune intervention trouvée.</p>';
}

async function login() {
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value?.trim();
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) return alert('Connexion refusée : ' + error.message);
  currentUser = data.user;
  await loadProfile(currentUser.id);
  location.href = 'dashboard.html';
}

async function logout() {
  await sb().auth.signOut();
  currentUser = null;
  currentProfile = null;
  location.href = 'index.html';
}

async function submitRequest(e) {
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
    technicien_id: document.getElementById('technicienSelect')?.value || null
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
  location.href = 'requests.html';
}

function bindCommon() {
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
}

function bindLogin() {
  document.getElementById('loginBtn')?.addEventListener('click', login);
}

function bindDashboard() {
  renderDashboard();
}

function bindNewRequest() {
  document.getElementById('priorityGroup')?.addEventListener('click', e => {
    if (!e.target.matches('.chip')) return;
    selectedPriority = e.target.dataset.value;
    document.querySelectorAll('.chip').forEach(b => b.classList.toggle('active', b === e.target));
  });
  document.getElementById('requestForm')?.addEventListener('submit', submitRequest);
}

function openDetails(id) {
  const modal = document.getElementById('detailsModal');
  const modalBody = document.getElementById('modalBody');
  const r = requests.find(x => x.id === id);
  if (!r || !modal || !modalBody) return;
  modalBody.innerHTML = `
    <button class="close-btn" id="closeModalBtn" type="button">×</button>
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
  `;
  modal.showModal();
  modalBody.querySelector('#closeModalBtn')?.addEventListener('click', () => modal.close());
}

function bindRequests() {
  document.getElementById('searchInput')?.addEventListener('input', renderRequests);
  document.getElementById('statusFilter')?.addEventListener('change', renderRequests);
  document.getElementById('priorityFilter')?.addEventListener('change', renderRequests);
  document.getElementById('requestList')?.addEventListener('click', e => {
    const card = e.target.closest('.request-card');
    if (card) openDetails(card.dataset.id);
  });
}

async function init() {
  if (!window.supabaseClient) return;
  const hasAuth = await ensureAuth();
  if (!hasAuth && page() !== 'login') return;

  bindCommon();

  if (page() === 'login') {
    showLoginState();
    bindLogin();
    return;
  }

  showAppState();
  await loadProfile(currentUser.id);
  await loadTechnicians();
  await loadRequests();

  if (page() === 'dashboard') bindDashboard();
  if (page() === 'new-request') bindNewRequest();
  if (page() === 'requests') bindRequests();
}

window.addEventListener('DOMContentLoaded', init);
