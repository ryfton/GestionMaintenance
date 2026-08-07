// Unified script combining script.js and script-3.js
// Kept readable; deduplicated and harmonized IDs and listeners.

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
  const list = document.getElementById('requestList');
  if (!list && page() === 'requests') return;

  const { data, error } = await sb().from('interventions').select('*, techniciens(id, nom)').order('created_at', { ascending: false });
  if (error) { alert('Erreur chargement interventions : ' + error.message); return; }

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
  currentUser = data.user; await loadProfile(currentUser.id); await refreshAll();
}

async function logout(){ await sb().auth.signOut(); currentUser=null; currentProfile=null; technicians=[]; requests=[]; location.href='index.html'; }

// Modal & details handling
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
  m.dataset.id = id; m.showModal?.(); loadHistory(id); loadTechSelectInModal(r.technicienId || '');
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

// Form submit for new-request
document.addEventListener('DOMContentLoaded', ()=>{
  if(page()==='new-request'){
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

    // priority chips
    document.querySelectorAll('.chip')?.forEach(b=> b.addEventListener('click', e=>{ document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active')); b.classList.add('active'); selectedPriority = b.dataset.value;}));

    loadTechnicians();
  }

  if(page()==='requests'){
    // open modal on click
    document.getElementById('requestList')?.addEventListener('click', e=>{ const card = e.target.closest('.request-card'); if(card) openDetails(card.dataset.id); });
  }

  // common listeners for modal buttons
  document.addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    if(btn.dataset.action==='take') return takeCharge(document.getElementById('detailsModal')?.dataset.id);
    if(btn.id==='saveNoteBtn') return saveNote(document.getElementById('detailsModal')?.dataset.id);
    if(btn.id==='saveTechBtn') return assignTech(document.getElementById('detailsModal')?.dataset.id, document.getElementById('technicienSelectModal')?.value);
    if(btn.classList.contains('status-btn') && btn.dataset.status) return updateStatus(document.getElementById('detailsModal')?.dataset.id, btn.dataset.status);
  });

  // attach logout if present
  document.getElementById('logoutBtn')?.addEventListener('click', ()=>{ logout(); });

  // page init
  if(page()==='requests') { loadRequests(); loadTechnicians(); }
  if(page()==='dashboard') { loadRequests(); }
});
