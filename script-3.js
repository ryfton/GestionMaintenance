// Script unique : fonctions applicatives + routeur + tableau de bord

let currentUser = null;
let currentProfile = null;
let selectedPriority = 'Basse';
let requests = [];
let technicians = [];

function sb() { return window.supabaseClient; }

function page() {
  const path = location.pathname.split('/').pop() || 'index.html';
  if (path === 'dashboard.html') return 'dashboard';
  if (path === 'new-request.html') return 'new-request';
  if (path === 'requests.html') return 'requests';
  if (path === 'installations.html') return 'installations';
  if (path === 'stock.html') return 'stock';
  if (path === 'archives.html') return 'archives';
  return 'login';
}

function badgeClass(status) {
  return ({'NOUVEAU':'b-nouveau','EN COURS':'b-cours','EN ATTENTE':'b-attente','TERMINE':'b-termine','ANNULE':'b-annule'})[status] || 'b-attente';
}

function roleName(r) { return ({admin:'Administrateur',technicien:'Technicien',demandeur:'Demandeur'})[r] || 'Utilisateur'; }

async function ensureAuth() {
  const { data } = await sb().auth.getSession();
  currentUser = data.session?.user || null;
  if (!currentUser && page() !== 'login') location.href = 'index.html';
  return !!currentUser;
}

async function loadProfile(userId) {
  const { data, error } = await sb().from('profiles').select('*').eq('id', userId).single();
  if (!error) currentProfile = data;
}

async function loadTechnicians() {
  const { data, error } = await sb().from('techniciens').select('*').eq('actif', true).order('nom', { ascending: true });
  technicians = error ? [] : (data || []);
  renderTechniciansOptions();
}

function renderTechniciansOptions(selected = ''){
  const sel = document.getElementById('technicienSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Aucun</option>' + technicians.map(t => `<option value="${t.id}" ${t.id==selected? 'selected':''}>${t.nom}</option>`).join('');
}

async function loadRequests() {
  const { data, error } = await sb().from('interventions').select('*, techniciens(id, nom)').order('created_at', { ascending: false });
  if (error) { console.error('Erreur chargement interventions :', error.message); return; }

  requests = (data || []).map(row => ({
    id: row.id, code: row.code, name: row.demandeur, department: row.departement, site: row.site,
    equipment: row.equipement, material: row.materiel, priority: row.priorite, description: row.description,
    status: row.etat, technicienId: row.technicien_id, technicienNom: row.techniciens?.nom || '',
    createdAt: new Date(row.created_at).toLocaleString('fr-FR')
  }));

  render();
}

function render() {
  const list = document.getElementById('requestList');
  if (!list) return;

  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const status = document.getElementById('statusFilter')?.value || '';
  const priority = document.getElementById('priorityFilter')?.value || '';

  const filtered = requests.filter(r => {
    if (q && ![r.code, r.name, r.department, r.site, r.equipment, r.material, r.description, r.technicienNom].join(' ').toLowerCase().includes(q)) return false;
    if (status && r.status !== status) return false;
    if (priority && r.priority !== priority) return false;
    return true;
  });

  list.innerHTML = filtered.map(r => `
    <article class="request-card" data-id="${r.id}">
      <div>
        <div class="meta">${r.code} · ${r.name}</div>
      </div>
      <div style="text-align:right">
        <div class="badge ${badgeClass(r.status)}">${r.priority}</div>
        <div class="meta" style="margin-top:10px">${r.createdAt}</div>
      </div>
    </article>
  `).join('') || '<p class="meta">Aucune intervention trouvée.</p>';
}

async function refreshAll() { await Promise.all([loadTechnicians(), loadRequests()]); }

async function login() {
  const email = document.getElementById('email')?.value.trim();
  const password = document.getElementById('password')?.value.trim();
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) return alert('Connexion refusée : ' + error.message);
  currentUser = data.user; await loadProfile(currentUser.id); location.href = 'dashboard.html';
}

async function logout(){ await sb().auth.signOut(); currentUser=null; currentProfile=null; technicians=[]; requests=[]; location.href='index.html'; }

const modal = document.getElementById?.('detailsModal');
function openDetails(id){
  const r = requests.find(x=>x.id==id);
  const m = document.getElementById('detailsModal');
  if (!m || !r) return;
  const modalBody = m.querySelector('#modalBody');
  modalBody.innerHTML = `
    <article class="request-card" data-id="${r.id}">
      <div>
        <div class="meta">${r.code || ''} · ${r.name || ''}</div>
      </div>
      <div style="text-align:right">
        <div class="badge ${badgeClass(r.status)}">${r.priority}</div>
        <div class="meta" style="margin-top:10px">${r.createdAt}</div>
      </div>
    </article>

    <div class="detail-grid">
      <div class="detail-box"><strong>Demandeur</strong><div>${r.name}</div></div>
      <div class="detail-box"><strong>Département</strong><div>${r.department}</div></div>
      <div class="detail-box"><strong>Site</strong><div>${r.site}</div></div>
      <div class="detail-box"><strong>Priorité</strong><div>${r.priority}</div></div>
      <div class="detail-box"><strong>Technicien</strong><div>${r.technicienNom || 'Aucun renseigné'}</div></div>
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
  m.dataset.id = id; m.showModal?.(); loadHistory(id); renderTechniciansOptionsInModal(r.technicienId || '');
}

async function loadHistory(id){
  const box = document.getElementById('historyBox'); if(!box) return;
  const { data: history, error: hError } = await sb().from('historique_interventions').select('*').eq('intervention_id', id).order('created_at', { ascending: false });
  const { data: notes, error: nError } = await sb().from('notes_interventions').select('*').eq('intervention_id', id).order('created_at', { ascending: false });
  if (hError || nError) { box.innerHTML = '<p class="meta">Erreur chargement historique</p>'; return; }
  box.innerHTML = '';
  (notes||[]).forEach(n=>{ box.innerHTML += `<div class="note">${n.note} <div class="meta">${new Date(n.created_at).toLocaleString('fr-FR')}</div></div>` });
  (history||[]).forEach(h=>{ box.innerHTML += `<div class="history">${h.note} <div class="meta">${new Date(h.created_at).toLocaleString('fr-FR')}</div></div>` });
}

function renderTechniciansOptionsInModal(selected=''){ const wrap = document.getElementById('techSelectWrap'); if(!wrap) return; wrap.innerHTML = `<select id="technicienSelectModal"><option value="">Aucun</option>${technicians.map(t=>`<option value="${t.id}" ${t.id==selected?'selected':''}>${t.nom}</option>`).join('')}</select>`; }

async function saveNote(id){
  const noteText = document.getElementById('noteText')?.value.trim(); if(!noteText) return alert('Note vide');
  const { error } = await sb().from('notes_interventions').insert([{ intervention_id: id, note: noteText, created_by: currentUser?.email || null }]);
  if (error) return alert('Erreur enregistrement note : '+error.message);
  await loadHistory(id); document.getElementById('noteText').value='';
}

async function assignTech(id, techId){
  const { error } = await sb().from('interventions').update({ technicien_id: techId, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return alert('Erreur assignation : '+error.message);
  await sb().from('historique_interventions').insert([{ intervention_id: id, ancien_etat: null, nouvel_etat: 'ASSIGNE', note: `Assignation`, changed_by: currentUser?.email || null }]);
  await refreshAll(); document.getElementById('detailsModal')?.close?.();
}

async function updateStatus(id, newStatus){
  const oldRequest = requests.find(r=>r.id===id); const oldStatus = oldRequest ? oldRequest.status : null;
  const { error } = await sb().from('interventions').update({ etat: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return alert('Erreur mise à jour : '+error.message);
  await sb().from('historique_interventions').insert([{ intervention_id: id, ancien_etat: oldStatus, nouvel_etat: newStatus, note: `Changement d\'état`, changed_by: currentUser?.email || null }]);
  await refreshAll(); document.getElementById('detailsModal')?.close?.();
}

async function takeCharge(id){
  const tech = technicians.find(t=>t.email===currentUser?.email);
  if(!tech) return alert('Aucun technicien trouvé pour cet utilisateur.');
  await assignTech(id, tech.id);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

async function updateDashboard() {
  const ouvertes = requests.filter(r => ['NOUVEAU', 'EN COURS', 'EN ATTENTE'].includes(r.status)).length;
  const enCours = requests.filter(r => r.status === 'EN COURS').length;
  const enAttente = requests.filter(r => r.status === 'EN ATTENTE').length;
  const terminees = requests.filter(r => r.status === 'TERMINE').length;

  setText('openCount', ouvertes);
  setText('openCountSummary', enCours);
  setText('waitingCountSummary', enAttente);
  setText('doneCountSummary', terminees);
  setText('statsText', `${requests.length} intervention(s) enregistrée(s), dont ${ouvertes} ouverte(s).`);

  try {
    const { count, error } = await sb().from('installations').select('id', { count: 'exact', head: true });
    setText('installationCount', error ? '-' : (count ?? 0));
  } catch { setText('installationCount', '-'); }

  try {
    const { data, error } = await sb().from('articles').select('quantite,seuil');
    if (!error && Array.isArray(data)) {
      setText('stockAlertCount', data.filter(a => Number(a.quantite) <= Number(a.seuil)).length);
    } else { setText('stockAlertCount', '-'); }
  } catch { setText('stockAlertCount', '-'); }

  renderRecentRequests();
}

function renderRecentRequests() {
  const lower = document.querySelector('.dashboard-lower');
  if (!lower) return;

  document.getElementById('recentRequestsCard')?.remove();

  const card = document.createElement('section');
  card.className = 'card dashboard-recent';
  card.id = 'recentRequestsCard';

  const recent = requests.slice(0, 6);
  card.innerHTML = `
    <div class="dashboard-main-header">
      <h2>Dernières interventions</h2>
      <a class="inline-link" href="requests.html">Voir tout</a>
    </div>
    <div class="request-list">
      ${recent.map(r => `
        <a class="request-card dashboard-request-link" href="requests.html">
          <div>
            <strong>${r.code || 'Intervention'}</strong>
            <div class="meta">${r.name || ''} · ${r.site || ''}</div>
          </div>
          <div>
            <span class="badge ${badgeClass(r.status)}">${r.status || '—'}</span>
            <div class="meta">${r.createdAt || ''}</div>
          </div>
        </a>
      `).join('') || '<p class="meta">Aucune intervention trouvée.</p>'}
    </div>
  `;

  lower.appendChild(card);
}

async function loadInstallationsSafely() {
  try {
    const { data, error } = await sb().from('installations').select('*').order('created_at', { ascending: false });
    if (error) return;
    const list = document.getElementById('installationsList');
    if (!list || !Array.isArray(data)) return;
    list.innerHTML = data.map(i => `
      <article class="request-card">
        <div>
          <strong>${i.nom || i.name || 'Installation'}</strong>
          <div class="meta">${i.site || i.lieu || ''}</div>
        </div>
      </article>
    `).join('') || '<p class="meta">Aucune installation trouvée.</p>';
  } catch {}
}

async function loadStockSafely() {
  try {
    const { data, error } = await sb().from('articles').select('*').order('created_at', { ascending: false });
    if (error) return;
    const list = document.getElementById('articlesList');
    if (!list || !Array.isArray(data)) return;
    list.innerHTML = data.map(a => `
      <article class="request-card">
        <div>
          <strong>${a.nom || a.name || 'Article'}</strong>
          <div class="meta">Quantité : ${a.quantite ?? '—'} · Seuil : ${a.seuil ?? '—'}</div>
        </div>
      </article>
    `).join('') || '<p class="meta">Aucun article trouvé.</p>';
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  const currentPage = page();

  if (currentPage === 'login') {
    document.getElementById('loginBtn')?.addEventListener('click', login);
  }

  if (currentPage === 'new-request') {
    document.getElementById('requestForm')?.addEventListener('submit', async e=>{
      e.preventDefault();
      const payload = {
        demandeur: document.getElementById('name').value.trim(), departement: document.getElementById('department').value.trim(), site: document.getElementById('site').value.trim(),
        equipement: document.getElementById('equipment').value.trim(), materiel: document.getElementById('material').value.trim(), priorite: selectedPriority,
        description: document.getElementById('description').value.trim(), etat: 'NOUVEAU', cree_par: currentUser?.id || null,
        technicien_id: document.getElementById('technicienSelect')?.value || null
      };
      const { data, error } = await sb().from('interventions').insert([payload]).select().single();
      if(error) return alert('Erreur enregistrement : '+error.message);
      if(data){ await sb().from('historique_interventions').insert([{ intervention_id: data.id, ancien_etat: null, nouvel_etat: 'NOUVEAU', note: 'Création de l\'intervention', changed_by: currentUser?.email || null }]); }
      e.target.reset(); selectedPriority='Basse'; document.querySelectorAll('.chip').forEach(b=>b.classList.toggle('active', b.dataset.value==='Basse')); await refreshAll(); alert('Intervention enregistrée.');
    });

    document.querySelectorAll('.chip')?.forEach(b=> b.addEventListener('click', e=>{ document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selectedPriority = b.dataset.value;}));
  }

  if (currentPage === 'requests') {
    document.getElementById('requestList')?.addEventListener('click', e=>{ const card = e.target.closest('.request-card'); if(card) openDetails(card.dataset.id); });
  }

  document.addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    if(btn.dataset.action==='take') return takeCharge(document.getElementById('detailsModal')?.dataset.id);
    if(btn.id==='saveNoteBtn') return saveNote(document.getElementById('detailsModal')?.dataset.id);
    if(btn.id==='saveTechBtn') return assignTech(document.getElementById('detailsModal')?.dataset.id, document.getElementById('technicienSelectModal')?.value);
    if(btn.classList.contains('status-btn') && btn.dataset.status) return updateStatus(document.getElementById('detailsModal')?.dataset.id, btn.dataset.status);
  });

  document.getElementById('logoutBtn')?.addEventListener('click', ()=>{ logout(); });
});

document.addEventListener('DOMContentLoaded', async () => {
  const currentPage = page();

  if (currentPage === 'requests') {
    await ensureAuth();
    await loadTechnicians();
    await loadRequests();
  } else if (currentPage === 'dashboard') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
    await loadRequests();
    await updateDashboard();
  } else if (currentPage === 'new-request') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
  } else if (currentPage === 'installations') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
    await loadInstallationsSafely();
  } else if (currentPage === 'stock') {
    await ensureAuth();
    await loadStockSafely();
  } else if (currentPage === 'archives') {
    await ensureAuth();
    await loadRequests();
  }
});
