let currentUser = null;
let currentProfile = null;
let selectedPriority = 'Basse';
let requests = [];
let technicians = [];
let stockArticles = [];
let installations = [];

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
  if (error || !data) {
    const { data: d2, error: e2 } = await sb().from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (!e2 && d2) { currentProfile = d2; return; }
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

function ensureConfirmModal() {
  if (document.getElementById('confirmModal')) return;
  const d = document.createElement('dialog');
  d.id = 'confirmModal';
  d.className = 'modal';
  d.innerHTML = `
    <div class="modal-content">
      <button class="close-btn" id="confirmCloseBtn">×</button>
      <h3 id="confirmTitle">Confirmer</h3>
      <p id="confirmMessage" class="meta" style="margin-top:10px;">Message</p>
      <div style="margin-top:18px; display:flex; gap:10px; justify-content:flex-end;">
        <button class="ghost" id="confirmCancel">Annuler</button>
        <button class="primary" id="confirmOk">Confirmer</button>
      </div>
    </div>
  `;
  document.body.appendChild(d);
  d.querySelector('#confirmCloseBtn')?.addEventListener('click', () => d.close());
  d.querySelector('#confirmCancel')?.addEventListener('click', () => d.close());
}

function showConfirm(message, title = 'Confirmez') {
  return new Promise((resolve) => {
    ensureConfirmModal();
    const modal = document.getElementById('confirmModal');
    modal.querySelector('#confirmTitle').textContent = title;
    modal.querySelector('#confirmMessage').textContent = message;
    function cleanup(result) { modal.removeEventListener('close', onClose); resolve(result); }
    function onClose() { cleanup(false); }
    function onOk(e) { e.stopPropagation(); modal.close(); cleanup(true); }
    modal.addEventListener('close', onClose);
    modal.querySelector('#confirmOk').addEventListener('click', onOk, { once: true });
    if (typeof modal.showModal === 'function') modal.showModal(); else modal.style.display = 'block';
  });
}

async function loadRequests() {
  const { data, error } = await sb().from('interventions').select('*, techniciens(id, nom)').eq('archived', false).order('created_at', { ascending: false });
  if (error) { console.error('Erreur chargement interventions :', error.message); return; }
  requests = (data || []).map(row => ({
    id: row.id, code: row.code, name: row.demandeur, department: row.departement, site: row.site,
    equipment: row.equipement, material: row.materiel, priority: row.priorite, description: row.description,
    status: row.etat, technicienId: row.technicien_id, technicienNom: row.techniciens?.nom || '',
    createdAt: new Date(row.created_at).toLocaleString('fr-FR'), archived: !!row.archived,
    start_time: row.start_time || null, end_time: row.end_time || null
  }));
  renderDashboard();
  renderRequests();
}

function formatDateTime(dt) { if (!dt) return '-'; try { return new Date(dt).toLocaleString('fr-FR'); } catch { return dt; } }

function durationText(start, end) {
  if (!start || !end) return '-';
  const minutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  const hrs = Math.floor(minutes / 60), mins = minutes % 60;
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
  const open = requests.filter(r => ['NOUVEAU','EN COURS','EN ATTENTE'].includes(r.status)).length;
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
    (!q || [r.code,r.name,r.department,r.site,r.equipment,r.material,r.description,r.technicienNom].join(' ').toLowerCase().includes(q)) &&
    (!status || r.status === status) && (!priority || r.priority === priority)
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
        <button class="small-btn archive-btn" data-id="${r.id}" ${r.archived || !canArchive(r.status) ? 'disabled' : ''} style="margin-top:8px;">Archiver</button>
      </div>
    </div>
  `).join('') || '<div class="card">Aucune intervention trouvée.</div>';
  list.querySelectorAll('.request-card').forEach(card => card.addEventListener('click', () => openRequestDetails(card.dataset.id)));
  list.querySelectorAll('.archive-btn').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const id = btn.dataset.id;
    const r = requests.find(x => String(x.id) === String(id));
    if (!r) return alert('Intervention introuvable.');
    if (r.archived) return alert('Déjà archivée.');
    if (!canArchive(r.status)) return alert('Seules les interventions terminées ou annulées peuvent être archivées.');
    const ok = await showConfirm("Confirmez-vous l'archivage de cette intervention ? Cette action est irréversible.");
    if (!ok) return;
    btn.disabled = true;
    await setArchiveState(id, true);
  }));
}

function renderTechnicianOptionsForModal(selected = '') {
  return '<option value="">Aucun</option>' + technicians.map(t => `<option value="${t.id}" ${String(t.id) === String(selected) ? 'selected' : ''}>${t.nom}</option>`).join('');
}

async function loadHistory(id) {
  const [notesRes, histRes] = await Promise.all([
    sb().from('notes_interventions').select('*').eq('intervention_id', id).order('created_at', { ascending: false }),
    sb().from('historique_interventions').select('*').eq('intervention_id', id).order('created_at', { ascending: false })
  ]);
  const notes = (notesRes.data || []).map(n => ({ note: n.note || n.contenu || '', auteur: n.created_by || n.auteur || 'Utilisateur', created_at: n.created_at || n.createdAt }));
  const history = (histRes.data || []).map(h => ({ note: h.note || h.action || '', ancien_etat: h.ancien_etat || h.old_status, nouvel_etat: h.nouvel_etat || h.new_status, created_at: h.created_at || h.createdAt, changed_by: h.changed_by || h.auteur }));
  return { notes, history };
}

function renderHistorySection(historyData) {
  const { notes, history } = historyData || { notes: [], history: [] };
  const notesHtml = notes.length ? notes.map(n => `<div class="detail-box"><small>${n.auteur} · ${n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : ''}</small><p style="margin-top:8px;">${escapeHtml(n.note)}</p></div>`).join('') : '<p class="meta">Aucune note.</p>';
  const histHtml = history.length ? history.map(h => `<div class="detail-box"><small>${h.changed_by || 'Système'} · ${h.created_at ? new Date(h.created_at).toLocaleString('fr-FR') : ''}</small><p style="margin-top:8px;">${escapeHtml(h.note)} <br><strong>État:</strong> ${h.ancien_etat || '-'} → ${h.nouvel_etat || '-'}</p></div>`).join('') : '<p class="meta">Aucun historique.</p>';
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;"><div><h3>Notes</h3>${notesHtml}</div><div><h3>Historique</h3>${histHtml}</div></div>`;
}

function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

async function openRequestDetails(id) {
  const modal = document.getElementById('detailsModal');
  const modalBody = document.getElementById('modalBody');
  let r = requests.find(x => String(x.id) === String(id));
  if (!r) {
    const { data: row, error } = await sb().from('interventions').select('*, techniciens(id, nom)').eq('id', id).maybeSingle();
    if (error || !row) return alert('Intervention introuvable.');
    r = { id: row.id, code: row.code, name: row.demandeur, department: row.departement, site: row.site, equipment: row.equipement, material: row.materiel, priority: row.priorite, description: row.description, status: row.etat, technicienId: row.technicien_id, technicienNom: row.techniciens?.nom || '', createdAt: new Date(row.created_at).toLocaleString('fr-FR'), archived: !!row.archived, start_time: row.start_time || null, end_time: row.end_time || null };
  }
  if (!modal || !modalBody || !r) return;
  const historyData = await loadHistory(id);
  modalBody.innerHTML = `
    <h2>${r.code || ''} — ${r.equipment || ''}</h2>
    <p class="meta">${escapeHtml(r.description || '')}</p>
    <div class="detail-grid">
      <div class="detail-box"><strong>Demandeur</strong><p>${escapeHtml(r.name || '-')}</p></div>
      <div class="detail-box"><strong>Département</strong><p>${escapeHtml(r.department || '-')}</p></div>
      <div class="detail-box"><strong>Site</strong><p>${escapeHtml(r.site || '-')}</p></div>
      <div class="detail-box"><strong>Matériel</strong><p>${escapeHtml(r.material || '-')}</p></div>
      <div class="detail-box"><strong>Priorité</strong><p>${escapeHtml(r.priority || '-')}</p></div>
      <div class="detail-box"><strong>Créé le</strong><p>${r.createdAt || '-'}</p></div>
      <div class="detail-box"><strong>Heure début</strong><p>${formatDateTime(r.start_time)}</p></div>
      <div class="detail-box"><strong>Heure fin</strong><p>${formatDateTime(r.end_time)}</p></div>
      <div class="detail-box"><strong>Durée</strong><p>${durationText(r.start_time, r.end_time)}</p></div>
    </div>
    <div class="detail-grid">
      <div class="field"><label for="modalTechnicienSelect">Technicien</label><select id="modalTechnicienSelect">${renderTechnicianOptionsForModal(r.technicienId)}</select></div>
      <div class="field"><label for="modalStatusSelect">Statut</label><select id="modalStatusSelect"><option value="NOUVEAU" ${r.status === 'NOUVEAU' ? 'selected' : ''}>Nouveau</option><option value="EN COURS" ${r.status === 'EN COURS' ? 'selected' : ''}>En cours</option><option value="EN ATTENTE" ${r.status === 'EN ATTENTE' ? 'selected' : ''}>En attente</option><option value="TERMINE" ${r.status === 'TERMINE' ? 'selected' : ''}>Terminé</option><option value="ANNULE" ${r.status === 'ANNULE' ? 'selected' : ''}>Annulé</option></select></div>
    </div>
    <div class="action-row" id="actionRow">
      <button class="primary" id="saveDetailsBtn">Enregistrer</button>
      <button class="ghost" id="archiveBtn">${r.archived ? 'Archivée' : 'Archiver'}</button>
    </div>
    <h3 style="margin-top:18px;">Ajouter un article du stock</h3>
    <div class="detail-grid">
      <div class="field"><label for="stockArticleSelect">Article</label><select id="stockArticleSelect"><option value="">Chargement...</option></select></div>
      <div class="field"><label for="stockQuantity">Quantité utilisée</label><input type="number" id="stockQuantity" min="1" value="1"></div>
    </div>
    <div class="action-row"><button class="primary" id="addStockBtn">Ajouter et déduire du stock</button></div>
    <h3 style="margin-top:18px;">Articles utilisés</h3>
    <div id="usedArticlesBox" class="request-list"><p class="meta">Chargement...</p></div>
    <h3 style="margin-top:18px;">Ajouter une note</h3>
    <textarea id="noteInput" class="note-box" placeholder="Écrire une note..."></textarea>
    <div class="action-row"><button class="primary" id="addNoteBtn">Ajouter la note</button></div>
    <h3 style="margin-top:18px;">Historique & Notes</h3>
    ${renderHistorySection(historyData)}
  `;
  if (r.archived) {
    ['modalTechnicienSelect','modalStatusSelect','saveDetailsBtn','archiveBtn','addNoteBtn','stockArticleSelect','stockQuantity','addStockBtn'].forEach(id => document.getElementById(id)?.setAttribute('disabled', 'disabled'));
    const ar = document.getElementById('actionRow');
    if (ar) { const p = document.createElement('div'); p.className = 'meta'; p.style.marginTop = '8px'; p.textContent = 'Cette intervention est archivée et est en lecture seule.'; ar.parentNode.insertBefore(p, ar.nextSibling); }
  }
  document.getElementById('saveDetailsBtn')?.addEventListener('click', () => saveRequestDetails(id));
  document.getElementById('addNoteBtn')?.addEventListener('click', () => addRequestNote(id));
  document.getElementById('addStockBtn')?.addEventListener('click', () => addStockToRequest(id));
  document.getElementById('archiveBtn')?.addEventListener('click', async () => { const ok = await showConfirm("Confirmez-vous l'archivage de cette intervention ? Cette action est irréversible."); if (!ok) return; await setArchiveState(id, true); });
  if (typeof modal.showModal === 'function') modal.showModal();
  await loadStockArticles();
  await loadUsedArticles(id);
}

async function loadStockArticles() {
  const select = document.getElementById('stockArticleSelect');
  if (!select) return;
  const { data, error } = await sb().from('articles').select('id, nom, quantite, prix_unitaire').order('nom', { ascending: true });
  if (error) { select.innerHTML = '<option value="">Erreur chargement du stock</option>'; return; }
  stockArticles = data || [];
  select.innerHTML = '<option value="">Choisir un article</option>' + stockArticles.map(a => `<option value="${a.id}">${escapeHtml(a.nom)} — stock : ${a.quantite ?? 0}</option>`).join('');
}

async function loadUsedArticles(interventionId) {
  const box = document.getElementById('usedArticlesBox');
  if (!box) return;
  const { data, error } = await sb().from('intervention_articles').select('id, quantite_utilisee, prix_unitaire, articles(nom)').eq('intervention_id', interventionId).order('created_at', { ascending: false });
  if (error) { box.innerHTML = `<p class="meta">Erreur chargement des articles : ${escapeHtml(error.message)}</p>`; return; }
  const items = data || [];
  box.innerHTML = items.map(i => `<div class="request-card"><div><strong>${escapeHtml(i.articles?.nom || 'Article')}</strong><div class="meta">Quantité : ${i.quantite_utilisee} · Prix unitaire : ${i.prix_unitaire} €</div></div><div class="meta">Total : ${(Number(i.quantite_utilisee) * Number(i.prix_unitaire)).toFixed(2)} €</div></div>`).join('') || '<p class="meta">Aucun article utilisé.</p>';
}

async function addStockToRequest(interventionId) {
  const articleId = document.getElementById('stockArticleSelect')?.value;
  const quantity = Number(document.getElementById('stockQuantity')?.value || 0);
  if (!articleId) return alert('Choisissez un article.');
  if (!quantity || quantity <= 0) return alert('Saisissez une quantité valide.');
  const article = stockArticles.find(a => String(a.id) === String(articleId));
  if (!article) return alert('Article introuvable.');
  if (quantity > Number(article.quantite || 0)) return alert(`Stock insuffisant : ${article.quantite} disponible(s).`);
  const { error: insertError } = await sb().from('intervention_articles').insert([{ intervention_id: interventionId, article_id: article.id, quantite_utilisee: quantity, prix_unitaire: article.prix_unitaire ?? 0, created_by: currentUser?.email || null }]);
  if (insertError) return alert('Erreur enregistrement article : ' + insertError.message);
  const newQuantity = Number(article.quantite || 0) - quantity;
  const { error: updateError } = await sb().from('articles').update({ quantite: newQuantity, updated_at: new Date().toISOString() }).eq('id', article.id);
  if (updateError) return alert('Article enregistré, mais erreur mise à jour du stock : ' + updateError.message);
  await sb().from('historique_stock').insert([{ article_id: article.id, changement: -quantity, raison: 'Utilisation dans une intervention', reference_intervention_id: interventionId, created_by: currentUser?.email || null }]);
  await loadStockArticles();
  await loadUsedArticles(interventionId);
}

async function saveRequestDetails(id) {
  const r = requests.find(x => String(x.id) === String(id));
  if (!r) return alert('Intervention introuvable.');
  if (r.archived) return alert('Cette intervention est archivée et ne peut pas être modifiée.');
  const status = document.getElementById('modalStatusSelect')?.value || null;
  const technicienId = document.getElementById('modalTechnicienSelect')?.value || null;
  const payload = { etat: status, technicien_id: technicienId || null };
  const prevStatus = r.status;
  if (prevStatus !== 'EN COURS' && status === 'EN COURS') payload.start_time = new Date().toISOString();
  if (prevStatus === 'EN COURS' && status === 'TERMINE') payload.end_time = new Date().toISOString();
  const { error } = await sb().from('interventions').update(payload).eq('id', id);
  if (error) return alert('Erreur modification : ' + error.message);
  await loadRequests();
  await openRequestDetails(id);
}

async function addRequestNote(id) {
  const note = document.getElementById('noteInput')?.value.trim();
  if (!note) return alert('Veuillez saisir une note');
  const { error } = await sb().from('notes_interventions').insert([{ intervention_id: id, note, created_by: currentUser?.email || 'Utilisateur' }]);
  if (error) return alert('Erreur ajout note : ' + error.message);
  document.getElementById('noteInput').value = '';
  await openRequestDetails(id);
}

function canArchive(status) { return status === 'TERMINE' || status === 'ANNULE'; }

async function setArchiveState(id, archive) {
  const r = requests.find(x => String(x.id) === String(id));
  if (!r) return alert('Intervention introuvable.');
  if (archive && !canArchive(r.status)) return alert('Seules les interventions terminées ou annulées peuvent être archivées.');
  const { error } = await sb().from('interventions').update({ archived: archive, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return alert('Erreur archivage : ' + error.message);
  await loadRequests();
  if (page() === 'archives') await loadArchivedRequests();
  document.getElementById('detailsModal')?.close?.();
}

async function loadArchivedRequests() {
  const list = document.getElementById('archiveList');
  if (!list) return;
  const { data, error } = await sb().from('interventions').select('*, techniciens(id, nom)').eq('archived', true).order('created_at', { ascending: false });
  if (error) { list.innerHTML = '<p class="meta">Erreur: '+error.message+'</p>'; return; }
  const items = (data || []).map(row => ({ id: row.id, code: row.code, equipment: row.equipement, name: row.demandeur, department: row.departement, site: row.site, technicienNom: row.techniciens?.nom || '', status: row.etat, priority: row.priorite, createdAt: new Date(row.created_at).toLocaleString('fr-FR'), start_time: row.start_time || null, end_time: row.end_time || null }));
  list.innerHTML = items.map(r => `<div class="request-card" data-id="${r.id}"><div><strong>${r.code || ''} — ${r.equipment || ''}</strong><p class="meta">${r.name} · ${r.department}</p><p class="meta">Début : ${formatDateTime(r.start_time)} · Fin : ${formatDateTime(r.end_time)} · Durée : ${durationText(r.start_time, r.end_time)}</p></div><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;min-width:140px;"><span class="badge ${badgeClass(r.status)}">${r.status}</span><span class="badge">${r.priority}</span></div></div>`).join('') || '<div class="card">Aucune intervention archivée.</div>';
  list.querySelectorAll('.request-card').forEach(card => card.addEventListener('click', () => openRequestDetails(card.dataset.id)));
}

function bindRequestsPage() {
  document.getElementById('searchInput')?.addEventListener('input', renderRequests);
  document.getElementById('statusFilter')?.addEventListener('change', renderRequests);
  document.getElementById('priorityFilter')?.addEventListener('change', renderRequests);
  document.getElementById('closeModalBtn')?.addEventListener('click', () => document.getElementById('detailsModal')?.close());
}

function bindModalClose() {
  document.getElementById('closeModalBtn')?.addEventListener('click', () => document.getElementById('detailsModal')?.close());
}

async function initRequestsPage() {
  bindRequestsPage();
  await ensureAuth();
  if (currentUser?.id) await loadProfile(currentUser.id);
  await loadTechnicians();
  await loadRequests();
}

async function initArchivesPage() {
  bindModalClose();
  await ensureAuth();
  if (currentUser?.id) await loadProfile(currentUser.id);
  await loadTechnicians();
  await loadArchivedRequests();
}

/* STOCK */
async function initStockPage() {
  await ensureAuth();
  bindStockPage();
  await loadArticlesList();
}

function bindStockPage() {
  document.getElementById('articleForm')?.addEventListener('submit', saveArticle);
  document.getElementById('resetArticleBtn')?.addEventListener('click', resetArticleForm);
  document.getElementById('articlesList')?.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('edit-article-btn')) return fillArticleForm(id);
    if (btn.classList.contains('delete-article-btn')) return deleteArticle(id);
  });
}

async function loadArticlesList() {
  const list = document.getElementById('articlesList');
  if (!list) return;
  const { data, error } = await sb().from('articles').select('*').order('nom', { ascending: true });
  if (error) { list.innerHTML = `<p class="meta">Erreur chargement du stock : ${escapeHtml(error.message)}</p>`; return; }
  stockArticles = data || [];
  list.innerHTML = stockArticles.map(a => `
    <div class="request-card">
      <div>
        <strong>${escapeHtml(a.nom)}</strong>
        <div class="meta">${escapeHtml(a.description || '')}</div>
        <div class="meta">Quantité : ${a.quantite ?? 0} · Seuil : ${a.seuil_min ?? 0} · Prix : ${a.prix_unitaire ?? 0} €</div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;">
        <button class="small-btn edit-article-btn" data-id="${a.id}">Modifier</button>
        <button class="small-btn delete-article-btn" data-id="${a.id}">Supprimer</button>
      </div>
    </div>
  `).join('') || '<p class="meta">Aucun article. Ajoute-en un avec le formulaire ci-dessus.</p>';
}

function resetArticleForm() {
  document.getElementById('articleId').value = '';
  document.getElementById('articleNom').value = '';
  document.getElementById('articleQuantite').value = 0;
  document.getElementById('articlePrix').value = '0.00';
  document.getElementById('articleSeuil').value = 0;
  document.getElementById('articleDesc').value = '';
}

function fillArticleForm(id) {
  const a = stockArticles.find(x => String(x.id) === String(id));
  if (!a) return;
  document.getElementById('articleId').value = a.id;
  document.getElementById('articleNom').value = a.nom || '';
  document.getElementById('articleQuantite').value = a.quantite ?? 0;
  document.getElementById('articlePrix').value = a.prix_unitaire ?? 0;
  document.getElementById('articleSeuil').value = a.seuil_min ?? 0;
  document.getElementById('articleDesc').value = a.description || '';
}

async function saveArticle(e) {
  e.preventDefault();
  const id = document.getElementById('articleId').value;
  const payload = {
    nom: document.getElementById('articleNom').value.trim(),
    quantite: Number(document.getElementById('articleQuantite').value || 0),
    prix_unitaire: Number(document.getElementById('articlePrix').value || 0),
    seuil_min: Number(document.getElementById('articleSeuil').value || 0),
    description: document.getElementById('articleDesc').value.trim(),
    updated_at: new Date().toISOString()
  };
  if (!payload.nom) return alert('Le nom est obligatoire.');
  const { error } = id
    ? await sb().from('articles').update(payload).eq('id', id)
    : await sb().from('articles').insert([payload]);
  if (error) return alert('Erreur enregistrement article : ' + error.message);
  resetArticleForm();
  await loadArticlesList();
}

async function deleteArticle(id) {
  const ok = await showConfirm('Supprimer cet article du stock ?');
  if (!ok) return;
  const { error } = await sb().from('articles').delete().eq('id', id);
  if (error) return alert('Erreur suppression : ' + error.message);
  await loadArticlesList();
}

/* INSTALLATIONS */
async function initInstallationsPage() {
  await ensureAuth();
  bindInstallationsPage();
  await loadInstallationsList();
}

function bindInstallationsPage() {
  document.getElementById('newInstallationBtn')?.addEventListener('click', () => openInstallationModal());
  document.getElementById('installationForm')?.addEventListener('submit', saveInstallation);
  document.getElementById('cancelInstBtn')?.addEventListener('click', () => document.getElementById('installationModal')?.close());
  document.getElementById('closeInstallationModal')?.addEventListener('click', () => document.getElementById('installationModal')?.close());
  document.getElementById('searchInstallations')?.addEventListener('input', renderInstallations);
  document.getElementById('statusFilterInstallations')?.addEventListener('change', renderInstallations);
  document.getElementById('installationList')?.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('edit-installation-btn')) return openInstallationModal(id);
    if (btn.classList.contains('delete-installation-btn')) return deleteInstallation(id);
  });
}

async function loadInstallationsList() {
  const { data, error } = await sb().from('installations').select('*').order('created_at', { ascending: false });
  if (error) {
    const list = document.getElementById('installationList');
    if (list) list.innerHTML = `<p class="meta">Erreur chargement installations : ${escapeHtml(error.message)}</p>`;
    return;
  }
  installations = data || [];
  renderInstallations();
}

function renderInstallations() {
  const list = document.getElementById('installationList');
  if (!list) return;
  const q = document.getElementById('searchInstallations')?.value?.toLowerCase() || '';
  const etat = document.getElementById('statusFilterInstallations')?.value || '';
  const filtered = installations.filter(i =>
    (!q || [i.code,i.nom,i.type,i.localisation,i.departement,i.responsable].join(' ').toLowerCase().includes(q)) &&
    (!etat || i.etat === etat)
  );
  list.innerHTML = filtered.map(i => `
    <div class="request-card">
      <div>
        <strong>${escapeHtml(i.code || '')} — ${escapeHtml(i.nom || '')}</strong>
        <div class="meta">${escapeHtml(i.type || '')} · ${escapeHtml(i.localisation || '')} · ${escapeHtml(i.departement || '')}</div>
        <div class="meta">Responsable : ${escapeHtml(i.responsable || 'Aucun')} · État : ${escapeHtml(i.etat || '-')}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end;">
        <button class="small-btn edit-installation-btn" data-id="${i.id}">Modifier</button>
        <button class="small-btn delete-installation-btn" data-id="${i.id}">Supprimer</button>
      </div>
    </div>
  `).join('') || '<p class="meta">Aucune installation. Clique sur « + Nouvelle installation ».</p>';
}

function openInstallationModal(id = '') {
  const modal = document.getElementById('installationModal');
  const installation = installations.find(i => String(i.id) === String(id));
  document.getElementById('installationModalTitle').textContent = installation ? 'Modifier l\'installation' : 'Nouvelle installation';
  document.getElementById('instCode').value = installation?.code || '';
  document.getElementById('instNom').value = installation?.nom || '';
  document.getElementById('instType').value = installation?.type || '';
  document.getElementById('instLocalisation').value = installation?.localisation || '';
  document.getElementById('instDepartement').value = installation?.departement || '';
  document.getElementById('instDateInstallation').value = installation?.date_installation || '';
  document.getElementById('instResponsable').value = installation?.responsable || '';
  document.getElementById('instEtat').value = installation?.etat || 'ACTIF';
  document.getElementById('instNotes').value = installation?.notes || '';
  modal.dataset.id = installation?.id || '';
  modal.showModal?.();
}

async function saveInstallation(e) {
  e.preventDefault();
  const modal = document.getElementById('installationModal');
  const id = modal.dataset.id;
  const payload = {
    code: document.getElementById('instCode').value.trim(),
    nom: document.getElementById('instNom').value.trim(),
    type: document.getElementById('instType').value.trim(),
    localisation: document.getElementById('instLocalisation').value.trim(),
    departement: document.getElementById('instDepartement').value.trim(),
    date_installation: document.getElementById('instDateInstallation').value || null,
    responsable: document.getElementById('instResponsable').value.trim(),
    etat: document.getElementById('instEtat').value,
    notes: document.getElementById('instNotes').value.trim(),
    updated_at: new Date().toISOString()
  };
  const { error } = id
    ? await sb().from('installations').update(payload).eq('id', id)
    : await sb().from('installations').insert([payload]);
  if (error) return alert('Erreur enregistrement installation : ' + error.message);
  modal.close();
  await loadInstallationsList();
}

async function deleteInstallation(id) {
  const ok = await showConfirm('Supprimer cette installation ?');
  if (!ok) return;
  const { error } = await sb().from('installations').delete().eq('id', id);
  if (error) return alert('Erreur suppression : ' + error.message);
  await loadInstallationsList();
}

async function login() {
  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value.trim() || '';
  if (!email || !password) return alert('Veuillez saisir email et mot de passe');
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) return alert('Connexion refusée : ' + error.message);
  currentUser = data.user;
  await loadProfile(currentUser.id);
  showAppState();
  if (!location.pathname.endsWith('dashboard.html')) location.href = 'dashboard.html';
}

if (document.getElementById('loginBtn')) {
  document.getElementById('loginBtn').addEventListener('click', login);
}

sb().auth.getSession().then(async ({ data }) => {
  if (data?.session) {
    currentUser = data.session.user;
    await loadProfile(currentUser.id);
    if (location.pathname === '/' || location.pathname.endsWith('index.html')) location.href = 'dashboard.html';
  } else if (location.pathname === '/' || location.pathname.endsWith('index.html')) {
    showLoginState();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const currentPage = page();
  if (currentPage === 'requests') await initRequestsPage();
  else if (currentPage === 'dashboard') { await ensureAuth(); if (currentUser?.id) await loadProfile(currentUser.id); await loadTechnicians(); await loadRequests(); }
  else if (currentPage === 'new-request') { await ensureAuth(); await loadTechnicians(); }
  else if (currentPage === 'archives') await initArchivesPage();
  else if (currentPage === 'installations') await initInstallationsPage();
  else if (currentPage === 'stock') await initStockPage();
});
