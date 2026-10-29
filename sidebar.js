(function(){
const pages=[['Tableau de bord','dashboard.html'],['Installations','installations.html'],['Nouvelle intervention','new-request.html'],['Demandes','requests.html'],['Stock','stock.html'],['Archives','archives.html']];
const page=()=>location.pathname.split('/').pop()||'dashboard.html';
function close(){document.getElementById('appSidebar')?.classList.remove('open');document.getElementById('sidebarOverlay')?.classList.remove('visible');document.body.style.overflow='';}
function open(){document.getElementById('appSidebar')?.classList.add('open');document.getElementById('sidebarOverlay')?.classList.add('visible');document.body.classList.add('sidebar-enabled');document.body.style.overflow='hidden';}
function init(){
if(page()==='index.html'||document.getElementById('appSidebar')||!document.querySelector('.topbar,.menu'))return;
const main=document.querySelector('main')||document.querySelector('.container')||document.body;main.classList.add('page-with-sidebar');document.body.classList.add('sidebar-enabled');
const side=document.createElement('aside');side.id='appSidebar';side.className='app-sidebar';
side.innerHTML=`<div class="sidebar-header"><button type="button" class="sidebar-toggle" id="sidebarToggle" aria-label="Basculer le menu">☰</button><div class="sidebar-brand"><div class="sidebar-logo">M</div><span>Maintenance</span></div><button type="button" class="sidebar-close" id="sidebarCloseBtn" aria-label="Fermer le menu">×</button></div><nav class="sidebar-nav" aria-label="Navigation principale">${pages.map(([label,href])=>`<a class="sidebar-link ${page()===href?'active':''}" href="${href}"><span>${label}</span></a>`).join('')}</nav><div class="sidebar-footer"><button type="button" class="sidebar-logout" id="sidebarLogoutBtn">Déconnexion</button></div>`;document.body.prepend(side);
const mobile=()=>matchMedia('(max-width:900px)').matches;
if(localStorage.getItem('sidebar-collapsed')==='true'){side.classList.add('collapsed');main.classList.add('sidebar-collapsed');document.body.classList.add('sidebar-collapsed');}
if(localStorage.getItem('sidebar-hidden')==='true'&&!mobile())document.body.classList.add('sidebar-hidden');
if(!document.getElementById('mobileSidebarOpenBtn')){const b=document.createElement('button');b.type='button';b.id='mobileSidebarOpenBtn';b.className='mobile-menu-button';b.setAttribute('aria-label','Ouvrir le menu');b.textContent='☰';b.onclick=open;const overlay=document.createElement('div');overlay.id='sidebarOverlay';overlay.className='sidebar-overlay';overlay.onclick=close;document.body.append(b,overlay);document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});}
document.getElementById('sidebarToggle').onclick=()=>{if(mobile())return open();const collapsed=side.classList.toggle('collapsed');main.classList.toggle('sidebar-collapsed',collapsed);document.body.classList.toggle('sidebar-collapsed',collapsed);localStorage.setItem('sidebar-collapsed',String(collapsed));};
document.getElementById('sidebarCloseBtn').onclick=()=>{if(mobile())close();};
document.getElementById('sidebarLogoutBtn').onclick=()=>{if(typeof logout==='function')return logout();if(window.supabaseClient?.auth)return window.supabaseClient.auth.signOut().then(()=>{location.href='index.html';});location.href='index.html';};
side.querySelectorAll('.sidebar-link').forEach(a=>a.addEventListener('click',()=>{if(mobile())close();}));
}
document.addEventListener('DOMContentLoaded',init);
})();

(function(){
const current=location.pathname.split('/').pop();
if(!['dashboard.html','installations.html','stock.html'].includes(current))return;
let busy=false,panel;
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function node(tag,value,cls){const e=document.createElement(tag);if(value!==undefined)e.textContent=value;if(cls)e.className=cls;return e;}
function setup(){
const main=document.querySelector('main');if(!main)return;
const style=node('style');style.textContent='.named-alert-panel{margin:20px 0;padding:18px;border:1px solid var(--line);border-radius:18px;background:var(--panel);min-width:0}.named-alert-header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.named-alert-list{display:grid;gap:10px;margin-top:12px}.named-alert-item{display:block;padding:12px;border:1px solid #a87928;border-radius:12px;background:rgba(245,158,11,.08);overflow-wrap:anywhere}.named-alert-item.overdue{border-color:var(--red);background:rgba(248,113,113,.08)}.named-alert-item small{display:block;margin-top:6px;color:var(--muted)}.named-alert-error{color:var(--red)}main:has(>.named-alert-panel){display:block}';document.head.appendChild(style);
panel=node('section',undefined,'named-alert-panel');panel.id='namedAlerts';panel.setAttribute('aria-label','Alertes de maintenance et de stock');
const header=node('div',undefined,'named-alert-header');header.appendChild(node('h2','⚠️ Alertes'));const refresh=node('button','Actualiser','small-btn');refresh.type='button';refresh.onclick=update;header.appendChild(refresh);panel.append(header,node('p','Chargement des alertes…','meta'),node('div',undefined,'named-alert-list'));
if(current==='dashboard.html')main.appendChild(panel);else main.prepend(panel);
update();setInterval(()=>{if(!document.hidden)update();},60000);window.addEventListener('focus',update);
}
function alertLink(title,detail,url,overdue=false){const a=node('a',undefined,'named-alert-item'+(overdue?' overdue':''));a.href=url;a.append(node('strong',title),node('small',detail));return a;}
async function update(){
if(busy||!panel)return;busy=true;const status=panel.querySelector('p'),list=panel.querySelector('.named-alert-list');const button=panel.querySelector('button');button.disabled=true;
try{
const db=window.supabaseClient;if(!db)throw new Error('Client Supabase indisponible.');
const{data:session,error:authError}=await db.auth.getSession();if(authError)throw authError;if(!session.session){status.textContent='Connectez-vous pour consulter les alertes.';list.replaceChildren();return;}
const today=new Date();today.setHours(0,0,0,0);const limit=new Date(today);limit.setDate(limit.getDate()+14);const todayKey=localDate(today),limitKey=localDate(limit);
const results=await Promise.allSettled([
current==='stock.html'?Promise.resolve(null):db.from('maintenance_systematique').select('id,installation_id,type_maintenance,description,date_prochaine_intervention,installations(nom,code)').lte('date_prochaine_intervention',limitKey).order('date_prochaine_intervention'),
current==='installations.html'?Promise.resolve(null):db.from('articles').select('id,nom,quantite,seuil_min').order('nom')
]);
const entries=[];let failed=false;
results.forEach((result,index)=>{
if(result.status==='rejected'||result.value?.error){failed=true;const error=result.status==='rejected'?result.reason:result.value.error;entries.push(node('p',`Erreur ${index===0?'maintenances':'stock'} : ${error.message||String(error)}`,'named-alert-error'));return;}
if(!result.value)return;
if(index===0){(result.value.data||[]).forEach(m=>{const i=Array.isArray(m.installations)?m.installations[0]:m.installations;const name=i?.nom||i?.code||'Installation non accessible';const due=m.date_prochaine_intervention;const late=due<todayKey;const label=late?'🔴 En retard':due===todayKey?'⚠️ Aujourd’hui':'🔧 À prévoir';const when=new Date(due+'T12:00:00').toLocaleDateString('fr-FR');entries.push(alertLink(`${label} — ${name}`,`${m.type_maintenance} · Échéance : ${when}${m.description?' · '+m.description:''}`,`installations.html?installation=${encodeURIComponent(m.installation_id)}`,late));});}
else{(result.value.data||[]).filter(a=>Number.isFinite(Number(a.quantite))&&Number.isFinite(Number(a.seuil_min))&&Number(a.quantite)<=Number(a.seuil_min)).forEach(a=>{entries.push(alertLink(`⚠️ Stock bas — ${a.nom}`,`Quantité restante : ${a.quantite} · Seuil minimum : ${a.seuil_min}`,`stock.html?article=${encodeURIComponent(a.id)}`,Number(a.quantite)<=0));});}
});
list.replaceChildren(...entries);
status.textContent=failed?'Certaines alertes n’ont pas pu être chargées.':entries.length?`${entries.length} alerte(s) visible(s) · Échéances jusqu’à 14 jours inclus, retards compris · Actualisé à ${new Date().toLocaleTimeString('fr-FR')}`:'Aucune alerte visible avec vos droits actuels.';
}catch(e){status.textContent='Erreur de chargement : '+e.message;list.replaceChildren();}finally{busy=false;button.disabled=false;}
}
document.addEventListener('DOMContentLoaded',setup);
})();
