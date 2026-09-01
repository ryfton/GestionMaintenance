let currentUser = null;
let currentProfile = null;
let selectedPriority = 'Basse';
let requests = [];
let technicians = [];
let articles = [];
let currentInterventionId = null; // To track intervention ID for article removal

function sb() {
  return window.supabaseClient;
}

function page() {
  const path = location.pathname.split('/').pop() || 'index.html';
  if (path === 'dashboard.html') return 'dashboard';
  if (path === 'new-request.html') return 'new-request';
  if (path === 'requests.html') return 'requests';
  if (path === 'archives.html') return 'archives';
  if (path === 'stock.html') return 'stock';
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

// --- Confirmation modal utility (styled) ---
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

    function cleanup(result) {
      modal.removeEventListener('close', onClose);
      resolve(result);
    }
    function onClose() {
      // if closed without pressing confirm -> false
      cleanup(false);
    }
    function onOk(e) {
      e.stopPropagation();
      modal.close();
      cleanup(true);
    }

    modal.addEventListener('close', onClose);
    modal.querySelector('#confirmOk').addEventListener('click', onOk, { once: true });
    // show modal
    if (typeof modal.showModal === 'function') modal.showModal(); else modal.style.display = 'block';
  });
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
      const ok = await showConfirm("Confirmez-vous l'archivage de cette intervention ? Cette action est irréversible.");
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

// Fetch notes + historique for an intervention
async function loadHistory(id) {
  const [notesRes, histRes] = await Promise.all([
    sb().from('notes_interventions').select('*').eq('intervention_id', id).order('created_at', { ascending: false }),
    sb().from('historique_interventions').select('*').eq('intervention_id', id).order('created_at', { ascending: false })
  ]);
  const notes = (notesRes.data || []).map(n => ({ note: n.note || n.contenu || '', auteur: n.created_by || n.auteur || 'Utilisateur', created_at: n.created_at || n.createdAt }));
  const history = (histRes.data || []).map(h => ({ note: h.note || h.action || '', ancien_etat: h.ancien_etat || h.old_status, nouvel_etat: h.nouvel_etat || h.new_status, created_at: h.created_at || h.createdAt }));
  return { notes, history };
}

function renderHistorySection(historyData) {
  const { notes, history } = historyData || { notes: [], history: [] };
  const notesHtml = notes.length ? notes.map(n => `
    <div class="detail-box">
      <small>${n.auteur} · ${n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : ''}</small>
      <p style="margin-top:8px;">${escapeHtml(n.note)}</p>
    </div>
  `).join('') : '<p class="meta">Aucune note.</p>';

  const histHtml = history.length ? history.map(h => `
    <div class="detail-box">
      <small>${h.changed_by || 'Système'} · ${h.created_at ? new Date(h.created_at).toLocaleString('fr-FR') : ''}</small>
      <p style="margin-top:8px;">${escapeHtml(h.note)} <br><strong>État:</strong> ${h.ancien_etat || '-'} → ${h.nouvel_etat || '-'}</p>
    </div>
  `).join('') : '<p class="meta">Aucun historique.</p>';

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
      <div>
        <h3>Notes</h3>
        ${notesHtml}
      </div>
      <div>
        <h3>Historique</h3>
        ${histHtml}
      </div>
    </div>
  `;
}

function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

async function openRequestDetails(id) {
  const modal = document.getElementById('detailsModal');
  const modalBody = document.getElementById('modalBody');
  // Try to find in cached requests first
  let r = requests.find(x => String(x.id) === String(id));

  // If not found (e.g., archived item), fetch directly from DB
  if (!r) {
    const { data: row, error } = await sb()
      .from('interventions')
      .select('*, techniciens(id, nom)')
      .eq('id', id)
      .maybeSingle();
    if (error || !row) return alert('Intervention introuvable.');
    r = {
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
    };
  }

  if (!modal || !modalBody || !r) return;

  currentInterventionId = id; // Store intervention ID for article removal

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

    <h3 style="margin-top:18px;">Sélectionner des articles</h3>
    <div id="articleSelectContainer" style="margin-bottom:12px;">
      <select id="articleSelect" style="width:100%;padding:8px;margin-bottom:8px;">
        <option value="">-- Sélectionner un article --</option>
        ${articles.map(a => `<option value="${a.id}">${a.nom} (Stock: ${a.quantite}, ${a.prix_unitaire}€)</option>`).join('')}
      </select>
      <div style="display:flex;gap:8px;">
        <input id="articleQtyInput" type="number" min="1" value="1" style="flex:1;padding:8px;" placeholder="Quantité" />
        <button class="primary" id="addArticleBtn" type="button">Ajouter</button>
      </div>
    </div>

    <div id="selectedArticlesList" style="margin-bottom:12px;border:1px solid # #f59e0b;padding:8px;border-radius:4px;min-height:40px;background:#151d33;">
      <small style="color:#666;">Aucun article sélectionné</small>
    </div>

    <h3 style="margin-top:18px;">Ajouter une note</h3>
    <textarea id="noteInput" class="note-box" placeholder="Écrire une note..."></textarea>
    <div class="action-row">
      <button class="primary" id="addNoteBtn">Ajouter la note</button>
    </div>

    <h3 style="margin-top:18px;">Historique & Notes</h3>
    ${renderHistorySection(historyData)}
  `;

  // If archived -> readonly: disable inputs and hide save/archive buttons
  if (r.archived) {
    document.getElementById('modalTechnicienSelect')?.setAttribute('disabled', 'disabled');
    document.getElementById('modalStatusSelect')?.setAttribute('disabled', 'disabled');
    document.getElementById('saveDetailsBtn')?.setAttribute('disabled', 'disabled');
    document.getElementById('archiveBtn')?.setAttribute('disabled', 'disabled');
    document.getElementById('addNoteBtn')?.setAttribute('disabled', 'disabled');
    document.getElementById('addArticleBtn')?.setAttribute('disabled', 'disabled');
    document.getElementById('articleSelect')?.setAttribute('disabled', 'disabled');
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

  // Store selected articles in modal data
  if (!modal.dataset.articles) modal.dataset.articles = '[]';

  document.getElementById('saveDetailsBtn')?.addEventListener('click', () => saveRequestDetails(id));
  document.getElementById('addNoteBtn')?.addEventListener('click', () => addRequestNote(id));
  document.getElementById('addArticleBtn')?.addEventListener('click', () => addArticleToIntervention(modal));
  document.getElementById('archiveBtn')?.addEventListener('click', async () => {
    const ok = await showConfirm("Confirmez-vous l'archivage de cette intervention ? Cette action est irréversible.");
    if (!ok) return;
    const shouldArchive = true; // once archived cannot be undone
    await setArchiveState(id, shouldArchive);
  });

  // Initial render of selected articles
  updateSelectedArticlesList(modal);

  if (typeof modal.showModal === 'function') modal.showModal();
}

function addArticleToIntervention(modal) {
  const articleId = document.getElementById('articleSelect')?.value;
  const qty = parseInt(document.getElementById('articleQtyInput')?.value) || 1;

  if (!articleId) {
    alert('Sélectionnez un article');
    return;
  }

  const article = articles.find(a => a.id === parseInt(articleId));
  if (!article) return;

  if (qty > article.quantite) {
    alert(`Quantité demandée (${qty}) supérieure au stock disponible (${article.quantite})`);
    return;
  }

  let selected = JSON.parse(modal.dataset.articles || '[]');
  
  // Check if article already selected
  const existing = selected.find(a => a.id === article.id);
  if (existing) {
    existing.qty += qty;
  } else {
    selected.push({
      id: article.id,
      nom: article.nom,
      prix_unitaire: article.prix_unitaire,
      qty: qty
    });
  }

  modal.dataset.articles = JSON.stringify(selected);
  document.getElementById('articleSelect').value = '';
  document.getElementById('articleQtyInput').value = 1;
  updateSelectedArticlesList(modal);
}

function updateSelectedArticlesList(modal) {
  const container = document.getElementById('selectedArticlesList');
  const selected = JSON.parse(modal.dataset.articles || '[]');

  if (selected.length === 0) {
    container.innerHTML = '<small style="color:#666;">Aucun article sélectionné</small>';
    return;
  }

  container.innerHTML = `
    <strong>Articles sélectionnés:</strong>
    ${selected.map((a, idx) => `
      <div style="display:flex;justify-content:space-between;padding:4px;margin:4px 0;background:#111a30;border-radius:3px;">
        <span>${a.nom} × ${a.qty} (${(a.prix_unitaire * a.qty).toFixed(2)}€)</span>
        <button class="small-btn remove-article-btn" data-index="${idx}" type="button" style="background:#443822;
  border:1px solid #f59e0b;">Retirer</button>
      </div>
    `).join('')}
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #ddd;text-align:right;">
      <strong>Total: ${selected.reduce((sum, a) => sum + (a.prix_unitaire * a.qty), 0).toFixed(2)}€</strong>
    </div>
  `;

  // Add remove listeners
  container.querySelectorAll('.remove-article-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.index);
      let updatedSelected = JSON.parse(modal.dataset.articles || '[]');
      const removedArticle = updatedSelected[idx];
      
      // Consume the article immediately via RPC
      const itemsToConsume = [{
        article_id: removedArticle.id,
        quantite: removedArticle.qty
      }];

      const { error: rpcError } = await sb().rpc('consume_articles_for_intervention', {
        p_intervention_id: currentInterventionId,
        p_items: itemsToConsume,
        p_user: currentUser?.email || 'Utilisateur'
      });

      if (rpcError) {
        alert('Erreur lors de la consommation des articles : ' + rpcError.message);
        return;
      }

      // Create a note with the consumed article
      const noteContent = `Matériel utilisé: ${removedArticle.nom} × ${removedArticle.qty}`;
      
      const { error: noteError } = await sb().from('notes_interventions').insert([{
        intervention_id: currentInterventionId,
        note: noteContent,
        created_by: currentUser?.email || 'Utilisateur'
      }]);

      if (noteError) {
        console.error('Erreur lors de la création de la note :', noteError);
      }

      // Remove from list
      updatedSelected.splice(idx, 1);
      modal.dataset.articles = JSON.stringify(updatedSelected);
      
      // Reload articles to show updated quantities
      await loadArticles();
      
      // Update display
      updateSelectedArticlesList(modal);
    });
  });
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

function bindModalClose() {
  document.getElementById('closeModalBtn')?.addEventListener('click', () => {
    document.getElementById('detailsModal')?.close();
  });
}

// --- Stock Management Functions ---

async function loadArticles() {
  const list = document.getElementById('articlesList');
  
  const { data, error } = await sb()
    .from('articles')
    .select('*')
    .order('nom', { ascending: true });

  if (error) {
    if (list) list.innerHTML = '<p class="meta">Erreur chargement articles : ' + error.message + '</p>';
    return;
  }

  articles = (data || []);
  if (list) renderArticles();
}

function renderArticles() {
  const list = document.getElementById('articlesList');
  if (!list) return;

  const q = document.getElementById('searchArticles')?.value?.toLowerCase() || '';
  const filtered = articles.filter(a => 
    !q || [a.nom, a.description].join(' ').toLowerCase().includes(q)
  );

  list.innerHTML = filtered.map(a => `
    <div class="request-card" style="margin-bottom:12px;">
      <div>
        <strong>${a.nom || ''}</strong>
        <p class="meta">Prix : ${a.prix_unitaire || 0}€ · Quantité : ${a.quantite || 0}</p>
        <p class="meta">Seuil min : ${a.seuil_min || 0} ${a.quantite < a.seuil_min ? '⚠️' : ''}</p>
        <p style="margin-top:8px;">${a.description || ''}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;min-width:120px;">
        <button class="small-btn edit-article-btn" data-id="${a.id}">Modifier</button>
        <button class="small-btn archive-btn" data-id="${a.id}">Supprimer</button>
      </div>
    </div>
  `).join('') || '<div class="card">Aucun article trouvé.</div>';

  list.querySelectorAll('.edit-article-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const article = articles.find(a => a.id === parseInt(id));
      if (article) editArticle(article);
    });
  });

  list.querySelectorAll('.archive-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const ok = await showConfirm('Êtes-vous sûr de vouloir supprimer cet article ?');
      if (ok) await deleteArticle(parseInt(id));
    });
  });
}

function editArticle(article) {
  document.getElementById('articleId').value = article.id || '';
  document.getElementById('articleNom').value = article.nom || '';
  document.getElementById('articleQuantite').value = article.quantite || 0;
  document.getElementById('articlePrix').value = article.prix_unitaire || 0;
  document.getElementById('articleSeuil').value = article.seuil_min || 0;
  document.getElementById('articleDesc').value = article.description || '';
  document.getElementById('articleNom').focus();
}

function resetArticleForm() {
  document.getElementById('articleId').value = '';
  document.getElementById('articleNom').value = '';
  document.getElementById('articleQuantite').value = 0;
  document.getElementById('articlePrix').value = 0;
  document.getElementById('articleSeuil').value = 0;
  document.getElementById('articleDesc').value = '';
}

async function saveArticle(e) {
  e.preventDefault();

  const id = document.getElementById('articleId').value;
  const nom = document.getElementById('articleNom').value.trim();
  const quantite = parseInt(document.getElementById('articleQuantite').value) || 0;
  const prix = parseFloat(document.getElementById('articlePrix').value) || 0;
  const seuil = parseInt(document.getElementById('articleSeuil').value) || 0;
  const description = document.getElementById('articleDesc').value.trim();

  if (!nom) {
    alert('Veuillez saisir un nom d\'article');
    return;
  }

  const payload = { nom, quantite, prix_unitaire: prix, seuil_min: seuil, description };

  let error;
  if (id) {
    // Update
    ({ error } = await sb().from('articles').update(payload).eq('id', parseInt(id)));
  } else {
    // Insert
    ({ error } = await sb().from('articles').insert([payload]));
  }

  if (error) {
    alert('Erreur : ' + error.message);
    return;
  }

  resetArticleForm();
  await loadArticles();
  alert('Article enregistré avec succès');
}

async function deleteArticle(id) {
  const { error } = await sb().from('articles').delete().eq('id', id);
  if (error) {
    alert('Erreur suppression : ' + error.message);
    return;
  }
  await loadArticles();
  alert('Article supprimé');
}

function bindStockPage() {
  const form = document.getElementById('articleForm');
  if (form) form.addEventListener('submit', saveArticle);

  const resetBtn = document.getElementById('resetArticleBtn');
  if (resetBtn) resetBtn.addEventListener('click', resetArticleForm);

  const searchInput = document.getElementById('searchArticles');
  if (searchInput) searchInput.addEventListener('input', renderArticles);
}

async function initStockPage() {
  await ensureAuth();
  if (currentUser?.id) await loadProfile(currentUser.id);
  await loadArticles();
  bindStockPage();
}

async function initRequestsPage() {
  bindRequestsPage();
  await ensureAuth();
  if (currentUser?.id) await loadProfile(currentUser.id);
  await loadTechnicians();
  await loadArticles();
  await loadRequests();
}

async function initArchivesPage() {
  bindModalClose();
  await ensureAuth();
  if (currentUser?.id) await loadProfile(currentUser.id);
  await loadTechnicians();
  await loadArticles();
  await loadArchivedRequests();
}

// DOM ready: ensure dashboard loads requests as well
document.addEventListener('DOMContentLoaded', async () => {
  if (page() === 'requests') {
    await initRequestsPage();
  } else if (page() === 'dashboard') {
    await ensureAuth();
    if (currentUser?.id) await loadProfile(currentUser.id);
    await loadTechnicians();
    await loadArticles();
    await loadRequests();
  } else if (page() === 'new-request') {
    await ensureAuth();
    await loadTechnicians();
    await loadArticles();
  } else if (page() === 'archives') {
    await initArchivesPage();
  } else if (page() === 'stock') {
    await initStockPage();
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

// Logout button
async function logout() {
  await sb().auth.signOut();
  currentUser = null;
  currentProfile = null;
  location.href = 'index.html';
}

if (document.getElementById('logoutBtn')) {
  document.getElementById('logoutBtn').addEventListener('click', logout);
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
