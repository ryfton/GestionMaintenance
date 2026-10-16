(function () {
  const sidebarPages = [
    { label: 'Tableau de bord', href: 'dashboard.html' },
    { label: 'Installations', href: 'installations.html' },
    { label: 'Nouvelle intervention', href: 'new-request.html' },
    { label: 'Demandes', href: 'requests.html' },
    { label: 'Stock', href: 'stock.html' },
    { label: 'Archives', href: 'archives.html' }
  ];

  function currentPage() {
    const path = window.location.pathname.split('/').pop() || 'dashboard.html';
    return path;
  }

  function callLogout() {
    if (typeof logout === 'function') {
      logout();
      return;
    }
    if (window.supabaseClient && window.supabaseClient.auth) {
      window.supabaseClient.auth.signOut().then(() => {
        window.location.href = 'index.html';
      });
      return;
    }
    window.location.href = 'index.html';
  }

  function buildSidebar() {
    const activePage = currentPage();
    const sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.id = 'appSidebar';

    const links = sidebarPages.map((page) => {
      const activeClass = activePage === page.href ? 'active' : '';
      return `<a class="sidebar-link ${activeClass}" href="${page.href}"><span>${page.label}</span></a>`;
    }).join('');

    sidebar.innerHTML = `
      <div class="sidebar-header">
        <button type="button" class="sidebar-toggle" id="sidebarToggle" aria-label="Basculer le menu">☰</button>
        <div class="sidebar-brand">
          <div class="sidebar-logo">M</div>
          <span>Maintenance</span>
        </div>
      </div>
      <nav class="sidebar-nav" aria-label="Navigation principale">
        ${links}
      </nav>
      <div class="sidebar-footer">
        <button type="button" class="sidebar-logout" id="sidebarLogoutBtn">Déconnexion</button>
      </div>
    `;

    document.body.insertBefore(sidebar, document.body.firstChild);

    const toggle = document.getElementById('sidebarToggle');
    const hideOnMobile = window.matchMedia('(max-width: 900px)');

    // Read saved state
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') {
      sidebar.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
    }

    toggle.addEventListener('click', () => {
      const collapsed = sidebar.classList.toggle('collapsed');
      if (hideOnMobile.matches) {
        // on mobile toggling should open/close the drawer
        sidebar.classList.toggle('open', !collapsed);
      }
      localStorage.setItem('sidebar-collapsed', collapsed ? 'true' : 'false');
    });

    const sidebarLogoutBtn = document.getElementById('sidebarLogoutBtn');
    if (sidebarLogoutBtn) {
      sidebarLogoutBtn.addEventListener('click', callLogout);
    }

    if (hideOnMobile.matches) {
      sidebar.classList.add('open');
    }
  }

  function shouldInitSidebar() {
    const page = currentPage();
    // initialize on all pages except the login/index page
    return page !== 'index.html' && page !== '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!shouldInitSidebar()) return;
    // only init if there's a topbar or menu (to avoid totally static pages)
    const hasTopbar = document.querySelector('.topbar') !== null || document.querySelector('.menu') !== null;
    if (!hasTopbar) return;

    document.body.classList.add('sidebar-enabled');
    if (!document.getElementById('appSidebar')) {
      buildSidebar();
    }
  });
})();
